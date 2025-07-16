const Farmer = require('./../models/farmerModel');
const Kilo = require('./../models/kiloModel');
const Wallet = require('./../models/walletModel');
const Automation = require('./../models/automationModel');
const { fetchAndSaveKilosInBatches } = require('./ifetchController');
const factory = require('./handlerFactory');
const catchAsync = require('./../utils/catchAsync');
const { logActivity } = require('./activityLoggerController');

exports.createFarmer = catchAsync(async (req, res, next) => {
  const farmer = await Farmer.create(req.body);
  await farmer.createWallet(farmer._id);

  res.status(201).json({
    status: 'success',
    data: farmer,
  });
});

exports.getFarmerStats = catchAsync(async (req, res, next) => {
  // Get the current count of farmer's kilos in the database
  let user = {
    _id: "6874a55c1c84ef1d882683f8",
    farmerCode: "0329541527",
  }

  console.log('Fetching kilos for farmer:', user.farmerCode);

  
  const dbKiloCount = await Kilo.countDocuments({ farmer:user._id });
  // const automation = await Automation.findOne();

  await fetchAndSaveKilosInBatches(
    user.farmerCode,
    user._id,
    dbKiloCount,
  );

  // if (automation?.status) {
  //   await fetchAndSaveKilosInBatches(
  //     req.user.farmerCode,
  //     req.user._id,
  //     dbKiloCount,
  //   );
  // }

  // Call the helper function to fetch and save in batches
  const wallet = await Wallet.findOne({ farmer: user._id });
  // In getFarmerStats
  await logActivity(req, 'farmer_viewed_produce', 'success', {
    wallet,
  });

  res.status(200).json({
    status: 'success',
    data: wallet,
  });
});

// exports.createFarmer = factory.createOne(Farmer);
exports.getFarmer = factory.getOne(Farmer);
exports.getAllFarmers = factory.getAll(Farmer);
exports.updateFarmer = factory.updateOne(Farmer);
exports.deleteFarmer = factory.deleteOne(Farmer);
