const mongoose = require('mongoose');
const Farmer = require('./../models/farmerModel');
const TransactionQueue = require('./../models/transactionQueueModel');
const Transaction = require('./../models/transactionModel');
const Wallet = require('./../models/walletModel');
const Paybill = require('./../models/paybillModel');
const factory = require('./handlerFactory');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const APIFeatures = require('./../utils/apiFeatures');
const MpesaB2cAPI = require('./../utils/mpesaB2c');
const MpesaB2bAPI = require('./../utils/mpesaB2b');
const SmsSender = require('./../utils/sms');
const { logActivity } = require('./activityLoggerController');
const { response } = require('../app');

// Instantiate mpesa the b2c loan service
const mpesaB2cService = new MpesaB2cAPI(
  process.env.MPESA_CONSUMER_KEY,
  process.env.MPESA_CONSUMER_SECRET,
);

// Instantiate mpesa the b2b service
const mpesaB2bService = new MpesaB2bAPI(
  process.env.MPESA_CONSUMER_KEY,
  process.env.MPESA_CONSUMER_SECRET,
);
// Intialize SMS service
const sender = new SmsSender(
  process.env.SMS_PROVIDER_URL,
  process.env.SMS_API_KEY,
);

// Helper Function for MPESA Charges
const getMpesaCharge = (amount) => {
  if (amount <= 100) return 0;
  if (amount <= 500) return 5;
  if (amount <= 5000) return 9;
  if (amount <= 20000) return 11;
  return 13;
};

exports.getAllFarmerTransactions = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(
    Transaction.find({ farmer: req.user._id }),
    req.query,
  )
    .filter()
    .sort()
    .limitFields()
    .search();

  const pagination = await features.paginate();
  const transactions = await features.query;

  // SEND RESPONSE
  res.status(200).json({
    status: 'success',
    totalRecords: pagination.totalDocuments,
    totalPages: pagination.totalPages,
    currentPage: pagination.currentPage,
    results: transactions.length,
    data: transactions,
  });
});

// Get farmer's transactions
exports.getFarmerTransactions = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(
    Transaction.find({ farmer: req.params.id }),
    req.query,
  )
    .filter()
    .sort()
    .limitFields()
    .search();

  const pagination = await features.paginate();
  const transactions = await features.query;

  // SEND RESPONSE
  res.status(200).json({
    status: 'success',
    totalRecords: pagination.totalDocuments,
    totalPages: pagination.totalPages,
    currentPage: pagination.currentPage,
    results: transactions.length,
    data: transactions,
  });
});

exports.loanRequest = catchAsync(async (req, res, next) => {
  let session;
  try {
    const { amount } = req.body;
    console.log(`${req.user} requested a loan of KES ${amount}`);

    if (!req.user.canBorrow) {
      throw new AppError(
        "You're currently blocked from borrowing. Please contact support for more details.",
        400,
      );
    }

    if (amount < 50) {
      throw new AppError('Amount must be kes. 50 and above', 400);
    }


    const wallet = await Wallet.findOne({ farmer: req.user._id });


    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const borrowedAmount = +amount;
    const charge = Math.round(borrowedAmount * 0.1);
    const totalDeduction = borrowedAmount + charge;

    if (wallet.loanLimit < totalDeduction) {
      throw new AppError('Insufficient loan limit', 400);
    }

    const phone = `254${req.user.phoneNumber.slice(-9)}`;

    // Update wallet with session
    await Wallet.findByIdAndUpdate(
      wallet._id,
      {
        $inc: {
          loanLimit: -totalDeduction,
          payableAmount: -totalDeduction,
          borrowedAmount: +borrowedAmount,
        },
      },
      { new: true, runValidators: true, session },
    );

    // Create TransactionQueue with session
    const transactionQueue = await TransactionQueue.create(
      [
        {
          wallet: wallet._id,
          transactionType: 'loan',
        },
      ],
      { session },
    );

    const transactionQueueId = transactionQueue[0]._id;

    // External MPESA transaction — not part of DB transaction
    // const response = await mpesaB2cService.initiateTransaction(
    //   amount,
    //   phone,
    //   transactionQueueId,
    //   process.env.B2C_LOAN_RESULT_URL,
    // );
    const response = {
      ConversationID: 'AG_20191219_00005797af5d7d75f65290',
      OriginatorConversationID: '16740-34861180-1',
      ResponseCode: '0',
      ResponseDescription: 'Accept the service request successfully.',
    };
    // Update transactionQueue with actual MPESA response
    if (response.ResponseCode === '0') {
      await TransactionQueue.updateOne(
        { _id: transactionQueueId },
        {
          $set: {
            txnRef: response.ConversationID,
            description: response.ResponseDescription,
          },
        },
        { session },
      );
      await Transaction.create(
        [
          {
            transactionQueueId: transactionQueueId,
            farmer: wallet.farmer.toString(),
            wallet: wallet._id,
            type: 'loan',
            amount: borrowedAmount,
            charge: charge,
            totalAmount: totalDeduction,
            status: 'pending',
            description: 'Amount requested for loan',
          },
        ],
        { session },
      );

      await logActivity(req, 'loan_requested', 'success', {
        amount: req.body.amount,
      });
      // Commit transaction
    await session.commitTransaction();
    session.endSession();
    } else {
      await TransactionQueue.updateOne(
        { _id: transactionQueueId },
        {
          $set: {
            status: 'failed',
            txnRef: response.ConversationID,
            description: response.ResponseDescription,
          },
        },
        // { session },
      );
      throw new AppError(response.ResponseDescription, 400);
    }

    

    res.status(200).json({
      status: 'success',
      message: 'Loan request successful!',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(error);
  }
});

exports.loanRequestCallback = async (req, res, next) => {
  const session = await mongoose.startSession();
  let transactionCommitted = false;

  try {
    session.startTransaction();

    const { Result } = req.body;
    const txnRef = Result.ConversationID;
    const transactionId = Result.TransactionID;
    if(!txnRef || !transactionId) {
      return res.status(400).json({ message: 'Invalid transaction reference or ID' });
    }

    // Fetch transaction queue inside session
    const queue = await TransactionQueue.findOne({ txnRef }).session(session);
    console.log(queue);

    if (!queue || queue.isComplete) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(200)
        .json({ message: 'Already processed or invalid queue.' });
    }

    // Update Transaction record
    await Transaction.updateOne(
      { transactionId },
      {
        $set: {
          status: 'completed',
          description: 'Amount sent to farmer phoneNumber for loans',
        },
      },
      { session }
    );

    // Mark queue as processed
    await TransactionQueue.findByIdAndUpdate(
      queue._id,
      {
        isNotified: true,
        isComplete: true,
        status: 'completed',
        description: 'loan request processed',
      },
      { new: true, runValidators: true, session }
    );

    // Commit all changes
    await session.commitTransaction();
    transactionCommitted = true;

    // Handle non-critical side effects (outside transaction)
    // await mpesaB2bService.initiateTransaction(
    //   charge,
    //   process.env.B2B_SHORT_CODE,
    //   process.env.B2B_RESULT_BAL_URL
    // );

    return res.status(200).json({ received: true });

  } catch (err) {
    // Only abort if transaction wasn't committed
    if (!transactionCommitted) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.warn('Abort failed:', abortErr.message);
      }
    }

    return res.status(400).send(`Webhook error: ${err.message}`);
  } finally {
    session.endSession();
  }
};


exports.airtimePurchase = catchAsync(async (req, res, next) => {
  const { phone, amount } = req.body;

  if (true) {
    return next(new AppError('Airtime coming soon!!', 400));
  }

  if (!req.user.canBorrow) {
    return next(
      new AppError(
        "You're currently blocked from borrowing. Please contact support for more details.",
        400,
      ),
    );
  }

  if (amount <= 9) {
    return next(new AppError('Amount must be kes. 10 and above', 400));
  }

  // Fetch wallet using farmerId
  const wallet = await Wallet.findOne({ farmer: req.user._id });

  const totalRequired = +amount * 1.04; // 4% charge

  if (!(wallet.loanLimit >= totalRequired)) {
    return next(new AppError('Insuffienct balance', 400));
  }

  const charge = +(+amount * 0.04).toFixed(2);
  const totalDeduction = +amount + charge;

  // Fetch wallet and update amount
  await Wallet.findByIdAndUpdate(
    wallet._id,
    {
      $inc: {
        loanLimit: -totalDeduction,
        payableAmount: -totalDeduction,
        borrowedAmount: +amount,
      },
    },
    { new: true, runValidators: true },
  );

  // Record a transaction
  await Transaction.create({
    farmer: wallet.farmer.toString(),
    wallet: wallet._id,
    type: 'airtime_purchase',
    amount: amount,
    charge: charge,
    totalAmount: totalDeduction,
    status: 'completed',
    description: 'Purchased airtime',
    airtimeDetails: {
      provider: 'Safaricom',
      recipientPhoneNumber: phone,
    },
  });

  // Send sms
  const smsOptions = {
    to: `+254${phone.slice(-9)}`,
    message: `You have successfully bought KSh ${amount} airtime for ${phone}. Enjoy your calls and messages!`,
  };
  await sender.sendSms(smsOptions);

  // In airtimePurchase (after successful purchase)
  await logActivity(req, 'airtime_purchased', 'success', {
    amount: req.body.amount,
    phone: req.body.phone,
  });

  res.status(200).json({
    status: 'success',
    message: 'Airtime purchase successful!',
  });
});

exports.moneyTransfer = async (req, res, next) => {
  const { phone, amount } = req.body;

  if (!req.user.canBorrow) {
    return next(
      new AppError(
        "You're currently blocked from borrowing. Please contact support for more details.",
        400,
      ),
    );
  }

  // Pause
  if (true) {
    return next(
      new AppError(
        'Service temporarily unavailable. Will resume on July 1st.',
        400,
      ),
    );
  }

  // Block
  // if (true) {
  //   return next(new AppError('Request failed try again later', 400));
  // }

  // if (+amount > 5000) {
  //   return next(new AppError('Request failed try again later.', 400));
  // }

  if (amount <= 9) {
    return next(new AppError('Amount must be kes. 10 and above', 400));
  }
  // Fetch wallet using farmerId
  const wallet = await Wallet.findOne({ farmer: req.user._id });

  // Calculate charges
  const interest = Math.round(amount * 0.1);
  // const mpesaCharges = getMpesaCharge(amount);
  // const convenienceFee = Math.round(amount * 0.05);
  const totalDeduction = +amount + interest;

  if (wallet.loanLimit < totalDeduction) {
    return next(new AppError('Insufficient balance!', 400));
  }

  const phoneNumber = `254${phone.slice(-9)}`;

  // Initiate B2C MPESA Transaction
  const response = await mpesaB2cService.initiateTransaction(
    amount,
    phoneNumber,
    process.env.B2C_MONEY_TRANSFER_URL,
  );

  // Save to transactionQueue collection
  if (response.ResponseCode === '0') {
    await TransactionQueue.create({
      txnRef: response.ConversationID,
      wallet: wallet._id,
      transactionType: 'money_transfer',
    });
    // In moneyTransfer (after validation)
    await logActivity(req, 'money_transfer_initiated', 'success', {
      amount: req.body.amount,
      recipient: req.body.phone,
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Money transfer request successful!',
  });
};

exports.moneyTransferCallback = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { Result } = req.body;
    const txnRef = Result.ConversationID;
    const transactionId = Result.TransactionID;

    // Step 1: Fetch queue in session
    const queue = await TransactionQueue.findOne({ txnRef }).session(session);
    if (!queue || queue.isComplete) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(200)
        .json({ message: 'Already processed or invalid queue.' });
    }

    // Step 2: Fetch wallet and farmer in session
    const wallet = await Wallet.findById(queue.wallet.toString()).session(
      session,
    );
    const farmer = await Farmer.findById(wallet.farmer.toString()).session(
      session,
    );

    const sentAmount = Result.ResultParameters.ResultParameter[0].Value;
    const charge = Math.round(sentAmount * 0.1);
    const totalDeduction = sentAmount + charge;

    const phoneNumber =
      Result.ResultParameters.ResultParameter[2].Value.match(/\d+/)[0];
    const receiverName =
      Result.ResultParameters.ResultParameter[2].Value.split(' - ')[1];

    // Step 3: Update wallet
    await Wallet.findByIdAndUpdate(
      wallet._id,
      {
        $inc: {
          loanLimit: -totalDeduction,
          payableAmount: -totalDeduction,
          borrowedAmount: +sentAmount,
        },
      },
      { new: true, runValidators: true, session },
    );

    // Step 4: Record transaction
    await Transaction.create(
      [
        {
          transactionId,
          farmer: wallet.farmer.toString(),
          wallet: wallet._id,
          type: 'money_transfer',
          amount: sentAmount,
          charge: charge,
          totalAmount: totalDeduction,
          status: 'completed',
          description: 'Amount sent to farmer phoneNumber for loans',
          transferDetails: {
            recipientPhoneNumber: `0${phoneNumber.slice(-9)}`,
          },
        },
      ],
      { session },
    );

    // Step 5: Update transaction queue
    await TransactionQueue.findByIdAndUpdate(
      queue._id,
      {
        isNotified: true,
        isComplete: true,
        description: 'money transfer request',
      },
      { new: true, runValidators: true, session },
    );

    // Step 6: Commit transaction
    await session.commitTransaction();
    session.endSession();

    // 🔁 External Side Effects (outside session)
    const smsReceiver = {
      to: `+254${phoneNumber.slice(-9)}`,
      message: `Dear ${receiverName}, you have received KSh ${sentAmount} from ${farmer.name} (Phone: 0${farmer.phoneNumber.slice(-9)}). Thank you for using our service!`,
    };
    const smsSender = {
      to: `+254${farmer.phoneNumber.slice(-9)}`,
      message: `Dear ${farmer.name}, you have successfully sent KSh ${sentAmount} to ${receiverName} (Phone: 0${phoneNumber.slice(-9)}). Thank you for using our service!`,
    };

    await sender.sendSms(smsReceiver);
    await sender.sendSms(smsSender);

    await mpesaB2bService.initiateTransaction(
      charge,
      process.env.B2B_SHORT_CODE,
      process.env.B2B_RESULT_BAL_URL,
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
});

// PAYBILL BALANCE QUERYING
exports.paybillBalance = catchAsync(async (req, res, next) => {
  const resp = await mpesaB2cService.checkBalance();
  res.status(200).json(resp);
});

exports.paybillBalanceCallback = catchAsync(async (req, res, next) => {
  // Split string using a whitespace
  const responseReceived =
    req.body.Result.ResultParameters.ResultParameter[1].Value.split(' ')[2];

  const numberRegex = /(\d+\.\d+)/;

  const match = responseReceived.match(numberRegex);

  const utilityBal = parseFloat(match[1]);

  await Paybill.findOneAndUpdate(
    {}, // Find the first document
    { $set: { amount: utilityBal } }, // Set the new amount
    { new: true, upsert: true, runValidators: true }, // 'upsert' will create the document if it doesn't exist
  );

  res.status(200).json({ received: true });
});

exports.B2bCallback = catchAsync(async (req, res, next) => {
  // Split string using a whitespace
  console.log(req.body);

  res.status(200).json({ received: true });
});

exports.getTransaction = factory.getOne(Transaction);
exports.getAllTransactions = factory.getAll(Transaction);
exports.updateTransaction = factory.updateOne(Transaction);
exports.deleteTransaction = factory.deleteOne(Transaction);
