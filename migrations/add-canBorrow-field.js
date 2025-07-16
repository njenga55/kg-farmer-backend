const mongoose = require('mongoose');
const Farmer = require('../models/farmerModel'); // Update the path

const runMigration = async () => {
  try {
    // Connect to your MongoDB
    await mongoose.connect('your-mongodb-uri', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Update all existing documents without canBorrow
    const result = await Farmer.updateMany(
      { canBorrow: { $exists: false } },
      { $set: { canBorrow: true } },
    );

    console.log(`Successfully updated ${result.nModified} documents`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

runMigration();
