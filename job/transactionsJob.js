const cron = require('node-cron');
const axios = require('axios');
const moment = require('moment-timezone');
const Kilo = require('../models/kiloModel');
const Farmer = require('../models/farmerModel');
const Wallet = require('../models/walletModel');

const withRetry = async (
  fn,
  context = 'operation',
  maxRetries = 3,
  baseDelay = 1000,
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.errorLabels?.includes('TransientTransactionError')) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `MongoDB transient error in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (error.response?.status === 503) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `503 encountered in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

cron.schedule(
  '*/9 * * * *',
  async () => {
    console.log(`Fetching transaction "Kilos" from Ifetch`);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    console.log(`today: ${today}`);
    console.log(`yesterday: ${yesterday}`);
    
    let skip = 0;
    const take = 100;
    let totalTransactions = 0;
    
    try {
      // Get initial token and transaction count
      const { token, expiry } = await login();
      const initialData = await queryTransactions(token, { 
        take: take, 
        skip: skip, 
        trxStart: "2025-07-15", 
        trxEnd: "2025-07-16" 
      });
      
      if (!initialData || !initialData.transactions) {
        console.log('Failed to fetch initial transaction data');
        return;
      }
      
      totalTransactions = initialData.count;
      console.log('Total transactions to process:', totalTransactions);
      console.log('Initial transaction data length:', initialData.transactions.length);
      
      if (totalTransactions === 0) {
        console.log('No transactions found for the specified period');
        return;
      }
      
      // Process initial batch
      await processTransactionBatch(initialData.transactions);
      skip += take;
      
      // Continue with remaining batches
      while (skip < totalTransactions) {
        console.log(`Fetching transactions from iFetch: ${skip} - ${skip + take}`);
        
        try {
          // Get fresh token if needed (check if current token is close to expiry)
          const currentTime = new Date().getTime();
          let currentToken = token;
          
          if (currentTime >= expiry - 60000) { // Refresh if less than 1 minute left
            console.log('Token expiring soon, refreshing...');
            const newAuth = await login();
            currentToken = newAuth.token;
          }
          
          // Fetch next batch
          const batchData = await queryTransactions(currentToken, { 
            skip: skip, 
            take: take, 
            trxStart: yesterday, 
            trxEnd: today 
          });
          
          if (!batchData || !batchData.transactions) {
            console.log(`Failed to fetch batch at skip ${skip}, stopping`);
            break;
          }
          
          if (batchData.transactions.length === 0) {
            console.log(`No more transactions found at skip ${skip}, stopping`);
            break;
          }
          
          // Process the batch
          await processTransactionBatch(batchData.transactions);
          // Sleep before next request
          await new Promise(resolve => setTimeout(resolve, 1000));

          skip += take;
          console.log(`Processed batch ${skip - take} - ${skip} of ${totalTransactions} transactions`);
          
        } catch (batchError) {
          console.error(`Error processing batch at skip ${skip}:`, batchError.message);
          // Decide whether to continue or stop based on error type
          if (batchError.code === 'ECONNABORTED' || batchError.code === 'ENOTFOUND') {
            console.log('Network error, stopping batch processing');
            break;
          }
          // For other errors, skip this batch and continue
          skip += take;
        }
      }
      
      console.log(`Completed processing all transactions. Total processed: ${skip}`);
      
    } catch (error) {
      console.error('Error in cron job:', error.message);
    }
  },
  {
    scheduled: true,
    timezone: 'Africa/Nairobi',
  },
);

// Helper function to process a batch of transactions
async function processTransactionBatch(transactions) {
  for (const transaction of transactions) {
    try {
      const farmerCode = transaction.farmerCode;
      const farmer = await Farmer.findOne({ farmerCode: farmerCode });
      
      if (!farmer) {
        console.log(`Farmer not found for code: ${farmerCode}, skipping transaction`);
        continue;
      }
      console.log(`Processing transaction for farmer: ${farmerCode}`);
      
      const farmerId = farmer._id;
      const kilo = new Kilo({
        recordID: transaction.recordID,
        farmer: farmerId,
        transTime: new Date(transaction.transTime),
        farmerCode,
        idNumber: transaction.idNumber,
        transCode: transaction.transCode,
        routeCode: transaction.routeCode,
        routeName: transaction.routeName,
        centreCode: transaction.centreCode,
        centreName: transaction.centreName,
        netUnits: transaction.netUnits,
        paymentRate: transaction.paymentRate,
        grossPay: transaction.grossPay,
        transportCost: transaction.transportCost,
        transportRecovery: transaction.transportRecovery,
      });
      
      await kilo.save();
      console.log(`Transaction ${transaction.recordID} inserted successfully`);
      
      const weight = parseFloat(transaction.netUnits.toFixed(2));
      const earningsAmount = parseFloat(transaction.grossPay.toFixed(2));
      const loanLimit = parseFloat((transaction.grossPay / 2).toFixed(2));
      const payableAmount = parseFloat(transaction.grossPay.toFixed(2));
      
      await Wallet.updateOne(
        { farmer: farmerId },
        {
          $inc: {
            weight,
            earningsAmount,
            loanLimit,
            payableAmount,
          },
        },
        { upsert: true } 
      );
      
    } catch (error) {
      if (error.code === 11000) {
        console.log(`Transaction with recordID ${transaction.recordID} already exists`);
      } else {
        console.error(`Error processing transaction ${transaction.recordID}:`, error.message);
        // Continue with next transaction instead of stopping
      }
    }
  }
}

const login = async () => {
  return withRetry(async () => {
    const response = await axios.post(
      'https://ifetch.tetteafactory.com:9443/api/account/login',
      {
        username: 'isaac-crystalgate',
        password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
      },
      { timeout: 10000 },
    );
    const token = response.data.token;
    const expiry = new Date(response.data.expiresat).getTime();

    return { token, expiry };
  }, 'login');
};

const queryTransactions = async (token, { skip = 0, take = 100, trxStart, trxEnd } = {}) => {
  return withRetry(async () => {
    const res = await axios.post(
      'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
      { skip, take, trxStart, trxEnd },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      },
    );
    return res.data;
  }, `queryTransactions (skip: ${skip}, take: ${take})`);
};
