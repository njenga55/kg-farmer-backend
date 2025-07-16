const Kilo = require('./../models/kiloModel');
const Farmer = require('./../models/farmerModel');
const { fetchAndSaveKilosInBatches } = require('./ifetchController');
const factory = require('./handlerFactory');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const APIFeatures = require('./../utils/apiFeatures');
const Automation = require('./../models/automationModel'); // Add at top

exports.createKilo = catchAsync(async (req, res, next) => {
  // 1) Get farmer by farmerCode
  const { farmerCode } = req.body;

  const farmer = await Farmer.findOne({ farmerCode });

  if (!farmer) {
    return next(new AppError('No farmer with farmerCode found!', 400));
  }

  req.body.farmer = farmer._id;

  // 2) Create kilo record
  const newKiloRecord = await Kilo.create(req.body);

  res.status(200).json({
    status: 'success',
    data: newKiloRecord,
  });
});

exports.getAllFarmerKilos = catchAsync(async (req, res, next) => {
  // Get the current count of farmer's kilos in the database
  const dbKiloCount = await Kilo.countDocuments({ farmer: req.user._id });
  // const automation = await Automation.findOne();

  await fetchAndSaveKilosInBatches(
    req.user.farmerCode,
    req.user._id,
    dbKiloCount,
  );

  // if (automation?.status) {
  //   await fetchAndSaveKilosInBatches(
  //     req.user.farmerCode,
  //     req.user._id,
  //     dbKiloCount,
  //   );
  // }

  // 3) Get all kilos for the farmer with pagination, filtering, sorting, and searching
  const features = new APIFeatures(
    Kilo.find({ farmer: req.user._id }),
    req.query,
  )
    .filter()
    .sort()
    .limitFields()
    .search();

  const pagination = await features.paginate();
  const kilos = await features.query;

  // SEND RESPONSE
  res.status(200).json({
    status: 'success',
    totalRecords: pagination.totalDocuments,
    totalPages: pagination.totalPages,
    currentPage: pagination.currentPage,
    results: kilos.length,
    data: kilos,
  });
});

// exports.createKilo = factory.createOne(Kilo);
exports.getKilo = factory.getOne(Kilo);
exports.getAllKilos = factory.getAll(Kilo);
exports.updateKilo = factory.updateOne(Kilo);
exports.deleteKilo = factory.deleteOne(Kilo);
