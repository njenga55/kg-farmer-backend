const mongoose = require('mongoose');
const Kilo = require('../models/kiloModel');
const Wallet = require('../models/walletModel');

const MONGO_URI =
  'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority'; // Replace with your DB

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Step 1: Find duplicates
    const duplicates = await Kilo.aggregate([
      {
        $group: {
          _id: '$recordID',
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: '$_id',
              netUnits: '$netUnits',
              grossPay: '$grossPay',
              farmer: '$farmer',
            },
          },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ]);

    if (duplicates.length === 0) {
      console.log('No duplicate recordIDs found.');
      return;
    }

    console.log(`Found ${duplicates.length} duplicates. Processing...`);

    for (const group of duplicates) {
      // Keep one, remove the rest
      const [keep, ...toDelete] = group.docs;

      for (const dup of toDelete) {
        // Revert Wallet changes
        const reverseLoanLimit = dup.grossPay / 2;

        await Wallet.updateOne(
          { farmer: dup.farmer },
          {
            $inc: {
              weight: -Number(dup.netUnits.toFixed(2)),
              earningsAmount: -Number(dup.grossPay.toFixed(2)),
              loanLimit: -Number(reverseLoanLimit.toFixed(2)),
              payableAmount: -Number(dup.grossPay.toFixed(2)),
            },
          },
        );

        // Delete duplicate Kilo record
        await Kilo.deleteOne({ _id: dup._id });

        console.log(
          `Deleted duplicate recordID ${group._id} (_id: ${dup._id}) and reverted wallet changes`,
        );
      }
    }

    console.log('Duplicate cleanup completed.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
})();
