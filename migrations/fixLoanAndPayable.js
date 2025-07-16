const mongoose = require('mongoose');
const Wallet = require('../models/walletModel');
const Farmer = require('../models/farmerModel');

// Replace this with your real connection string
const MONGO_URI =
  process.env.DATABASE ||
  'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority';

const recalculateLoanAndPayable = async (farmerId) => {
  const wallet = await Wallet.findOne({ farmer: farmerId });

  if (!wallet) {
    console.warn(`⚠️ Wallet not found for farmer ${farmerId}`);
    return;
  }

  const { earningsAmount, borrowedAmount } = wallet;

  const loanLimit = parseFloat(
    Math.max(earningsAmount / 2 - borrowedAmount, 0).toFixed(2),
  );
  const payableAmount = parseFloat(
    Math.max(earningsAmount - borrowedAmount, 0).toFixed(2),
  );

  await Wallet.updateOne(
    { farmer: farmerId },
    {
      $set: {
        loanLimit,
        payableAmount,
      },
    },
  );

  console.log(`✅ Updated loan/payable for farmer ${farmerId}`);
};

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('🔌 Connected to MongoDB');

    const farmers = await Farmer.find({}, '_id');
    console.log(`👨‍🌾 Found ${farmers.length} farmers`);

    for (const farmer of farmers) {
      await recalculateLoanAndPayable(farmer._id);
    }

    console.log('🎉 Done recalculating loanLimit and payableAmount');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
};

run();
