const mongoose = require('mongoose');

// 🔧 Replace with your actual connection string
const mongoUri =
  'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority'; // or MongoDB Atlas URI

// 🧾 Define a simple schema that matches your collection structure
const Wallet = require('../models/walletModel');

async function floorValues() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const records = await Wallet.find({});

    for (const doc of records) {
      const updates = {
        weight: Math.floor(doc.weight || 0),
        earningsAmount: Math.floor(doc.earningsAmount || 0),
        loanLimit: Math.floor(doc.loanLimit || 0),
        payableAmount: Math.floor(doc.payableAmount || 0),
      };

      await Wallet.updateOne({ _id: doc._id }, { $set: updates });
    }

    console.log('All decimal values floored successfully!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

floorValues();
