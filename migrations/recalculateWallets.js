const mongoose = require('mongoose');
// const dotenv = require('dotenv');

// Load your environment variables (if you use .env)
// dotenv.config();

// Models
const Kilo = require('../models/kiloModel');
const Wallet = require('../models/walletModel');
const Farmer = require('../models/farmerModel');

const MONGO_URI =
  process.env.DATABASE ||
  'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority';

// Function to recalculate wallet for a single farmer
const recalculateWallet = async (farmerId) => {
  const result = await Kilo.aggregate([
    { $match: { farmer: farmerId } },
    {
      $group: {
        _id: null,
        totalWeight: { $sum: '$netUnits' },
        totalEarnings: { $sum: '$grossPay' },
      },
    },
  ]);

  if (!result.length) return; // Skip farmers with no records

  const { totalWeight, totalEarnings } = result[0];

  await Wallet.updateOne(
    { farmer: farmerId },
    {
      $set: {
        weight: parseFloat(totalWeight.toFixed(2)),
        earningsAmount: parseFloat(totalEarnings.toFixed(2)),
      },
    },
  );

  console.log(`Updated wallet for farmer ${farmerId}`);
};

// Main function to connect and run for all farmers
const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const farmers = await Farmer.find({}, '_id');
    console.log(`Found ${farmers.length} farmers`);

    for (const farmer of farmers) {
      await recalculateWallet(farmer._id);
    }

    console.log('Finished recalculating all wallets');
    process.exit(0);
  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
};

run();
