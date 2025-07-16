const Wallet = require('../models/walletModel');

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

module.exports = { resetMonthlyFields };
