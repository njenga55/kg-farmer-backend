// ========== script.js ==========
const mongoose = require('mongoose');
const Wallet = require('../models/walletModel');

// Replace with your actual connection string
const MONGODB_URI =
  'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority'; // Update this

const resetMonthlyFields = async () => {
  try {
    const result = await Wallet.updateMany(
      {},
      {
        $set: {
          weight: 0,
          earningsAmount: 0,
          loanLimit: 0,
          borrowedAmount: 0,
          payableAmount: 0,
        },
      },
    );

    console.log(
      `✅ Monthly reset successful. Updated ${result.modifiedCount} wallets`,
    );
    return { success: true, message: `Reset ${result.modifiedCount} wallets` };
  } catch (error) {
    console.error('❌ Reset error:', error.message);
    return { success: false, message: error.message };
  }
};

const run = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('🔌 Connected to MongoDB');

    await resetMonthlyFields();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit();
  }
};

run();
