const cron = require('node-cron');
const axios = require('axios');
const moment = require('moment-timezone');
const Kilo = require('../models/kiloModel');
const Farmer = require('../models/farmerModel');
const Wallet = require('../models/walletModel');

// =====================
// Retry Helper
// =====================
const withRetry = async (
  fn,
  context = 'operation',
  maxRetries = 5,
  baseDelay = 1000
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isTransientError = error.errorLabels?.includes('TransientTransactionError');
      const isServiceUnavailable = error.response?.status === 503;

      if (isTransientError || isServiceUnavailable) {
        if (attempt === maxRetries) throw error;

        const delay = baseDelay * 2 ** (attempt - 1);
        console.warn(`${context} failed. Retry ${attempt}/${maxRetries} in ${delay}ms`);

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

// =====================
// Auth and API
// =====================
const login = async () => {
  return withRetry(async () => {
    const res = await axios.post(
      'https://ifetch.tetteafactory.com:9443/api/account/login',
      {
        username: 'isaac-crystalgate',
        password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
      },
      { timeout: 10000 }
    );

    return {
      token: res.data.token,
      expiry: new Date(res.data.expiresat).getTime(),
    };
  }, 'login');
};

const queryTransactions = async (token, { skip = 0, take = 100, trxStart, trxEnd }) => {
  return withRetry(async () => {
    const res = await axios.post(
      'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
      { skip, take, trxStart, trxEnd },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      }
    );
    return res.data;
  }, `queryTransactions (skip: ${skip}, take: ${take})`);
};

// =====================
// Transaction Processor
// =====================
const processTransactionBatch = async (transactions) => {
  for (const trx of transactions) {
    try {
      const farmer = await Farmer.findOne({ farmerCode: trx.farmerCode });

      if (!farmer) {
        console.log(`Farmer ${trx.farmerCode} not found. Skipping...`);
        continue;
      }

      const kilo = new Kilo({
        recordID: trx.recordID,
        farmer: farmer._id,
        transTime: new Date(trx.transTime),
        farmerCode: trx.farmerCode,
        idNumber: trx.idNumber,
        transCode: trx.transCode,
        routeCode: trx.routeCode,
        routeName: trx.routeName,
        centreCode: trx.centreCode,
        centreName: trx.centreName,
        netUnits: trx.netUnits,
        paymentRate: trx.paymentRate,
        grossPay: trx.grossPay,
        transportCost: trx.transportCost,
        transportRecovery: trx.transportRecovery,
      });

      await kilo.save();
      console.log(`Transaction ${trx.recordID} saved.`);

      const updateFields = {
        weight: parseFloat(trx.netUnits.toFixed(2)),
        earningsAmount: parseFloat(trx.grossPay.toFixed(2)),
        loanLimit: parseFloat((trx.grossPay / 2).toFixed(2)),
        payableAmount: parseFloat(trx.grossPay.toFixed(2)),
      };

      await Wallet.updateOne(
        { farmer: farmer._id },
        { $inc: updateFields },
        { upsert: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        console.log(`Duplicate transaction ${trx.recordID}. Skipping.`);
      } else {
        console.error(`Error processing ${trx.recordID}: ${err.message}`);
      }
    }
  }
};

// =====================
// Main Fetch & Process
// =====================
const fetchAndProcessTransactions = async () => {
  console.log(`--- Starting iFetch transaction job ---`);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let skip = 0;
  const take = 100;

  try {
    let { token, expiry } = await login();

    const initialData = await queryTransactions(token, {
      skip,
      take,
      trxStart: yesterday,
      trxEnd: today,
    });

    if (!initialData?.transactions || initialData.count === 0) {
      console.log('No transactions found.');
      return;
    }

    await processTransactionBatch(initialData.transactions);
    skip += take;

    const total = initialData.count;

    while (skip < total) {
      if (Date.now() >= expiry - 60000) {
        ({ token, expiry } = await login());
      }

      console.log(`Fetching transactions ${skip} - ${skip + take} of ${total}...`);

      try {
        const batchData = await queryTransactions(token, {
          skip,
          take,
          trxStart: yesterday,
          trxEnd: today,  
        });

        if (!batchData?.transactions?.length) break;

        await processTransactionBatch(batchData.transactions);
        skip += take;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (batchErr) {
        console.error(`Error on batch ${skip}: ${batchErr.message}`);
        if (['ECONNABORTED', 'ENOTFOUND'].includes(batchErr.code)) break;
        skip += take;
      }
    }

    console.log(`--- Completed processing ${skip} transactions --- of ${total}`);
  } catch (err) {
    console.error('Fatal error in transaction job:', err.message);
  }
};

// =====================
// CRON Job (Daily at Midnight)
// =====================
cron.schedule('0 0 * * *', fetchAndProcessTransactions, {
  scheduled: true,
  timezone: 'Africa/Nairobi',
});

// =====================
// Export for manual endpoint triggering (if needed)
// =====================
module.exports = {
  fetchAndProcessTransactions,
};
