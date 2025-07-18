const moment = require('moment');
const Transaction = require('./../models/transactionModel');
const Kilo = require('./../models/kiloModel');
const Wallet = require('./../models/walletModel');
const Farmer = require('./../models/farmerModel');
const User = require('./../models/userModel');
const Paybill = require('./../models/paybillModel');
const catchAsync = require('./../utils/catchAsync');
const MpesaB2cAPI = require('./../utils/mpesaB2c');
const Automation = require('./../models/automationModel');
const TransactionQueue = require('./../models/transactionQueueModel');
const { logActivity } = require('./activityLoggerController');
const  {fetchAndProcessTransactions}  = require('../job/transactionsJob');

// Instantiate mpesa the b2c loan service
const mpesaB2cService = new MpesaB2cAPI(
  process.env.MPESA_CONSUMER_KEY,
  process.env.MPESA_CONSUMER_SECRET,
);

exports.getFarmerStats = catchAsync(async (req, res, next) => {
  await mpesaB2cService.checkBalance();
  const transactions = await Transaction.aggregate([
    // Group by 'type' and calculate the total sum of 'amount' for each type
    {
      $group: {
        _id: '$type', // Group by 'type' field (loan, airtime_purchase, or money_transfer)
        totalAmount: { $sum: '$amount' }, // Calculate the sum of 'amount' for each type
      },
    },
    // Optional: Sort the result by type (if you want to display them in a specific order)
    {
      $sort: { _id: 1 }, // Sort by type, 1 for ascending order
    },
  ]);

  const kilos = await Kilo.aggregate([
    {
      $group: {
        _id: null, // Grouping by null means it will sum across all records
        totalNetUnits: { $sum: '$netUnits' },
      },
    },
  ]);

  const farmersCount = await Farmer.countDocuments();

  const usersCount = await User.countDocuments();

  const paybillBalance = await Paybill.findOne({});

  // Revenue breakdown
  const revenueBreakDown = await Transaction.aggregate([
    // Step 1: Match only completed transactions (you can change this filter if needed)
    { $match: { status: 'completed' } },

    // Step 2: Group by 'type' and calculate total amount per type
    {
      $group: {
        _id: '$type', // Group by type (loan, airtime_purchase, money_transfer)
        totalAmount: { $sum: '$amount' }, // Sum of amounts for each type
      },
    },

    // Step 3: Apply the specific percentage for each type
    {
      $addFields: {
        percentageAmount: {
          $switch: {
            branches: [
              {
                case: { $eq: ['$_id', 'loan'] }, // If type is "loan"
                then: { $multiply: ['$totalAmount', 0.1] }, // 10% of the total amount
              },
              {
                case: { $eq: ['$_id', 'airtime_purchase'] }, // If type is "airtime_purchase"
                then: { $multiply: ['$totalAmount', 0.04] }, // 4% of the total amount
              },
              {
                case: { $eq: ['$_id', 'money_transfer'] }, // If type is "money_transfer"
                then: { $multiply: ['$totalAmount', 0.1] }, // 10% of the total amount
              },
            ],
            default: 0, // Default case (if type doesn't match)
          },
        },
      },
    },

    // Step 4: Project the desired output (totalAmount and percentageAmount)
    {
      $project: {
        _id: 0, // Don't include the _id field
        type: '$_id', // Include the type
        totalAmount: 1, // Include the total amount
        percentageAmount: 1, // Include the calculated percentage amount
      },
    },
  ]);

  const payBillAvailableAmount = paybillBalance.amount;

  // SEND RESPONSE
  res.status(200).json({
    status: 'success',
    transactions,
    payBillAvailableAmount,
    kilos,
    farmers: farmersCount,
    users: usersCount,
    revenueBreakDown,
  });
});
exports.resetApplicationData = catchAsync(async (req, res, next) => {
  await Kilo.deleteMany({});
  await Wallet.deleteMany({});
  await logActivity(req, 'application_data_reset', 'success', {
    by: req.user,
  });

  res.status(200).json({
    status: 'success',
    message:  'Kilos and Wallet reset reset',
  });
});
exports.syncData = catchAsync(async (req, res, next) => {
  await logActivity(req, 'manual sync initiated', 'success', {
    by: req.user,
  });
    fetchAndProcessTransactions();
  res.status(200).json({
    status: 'success',
    message:  'manual sync initiated successfully',
  });
});

