const moment = require('moment-timezone');
const Farmer = require('../models/farmerModel');
const Kilo = require('../models/kiloModel');
const Transaction = require('../models/transactionModel');
const Wallet = require('../models/walletModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getPaymentReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  // 1. Validate input dates
  if (!startDate || !endDate) {
    return next(new AppError('Please provide both startDate and endDate', 400));
  }

  // 2. Convert to Nairobi time and create UTC date range
  const start = moment.tz(startDate, 'Africa/Nairobi').startOf('day');
  const end = moment.tz(endDate, 'Africa/Nairobi').endOf('day');

  if (!start.isValid() || !end.isValid()) {
    return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
  }

  const startUTC = start.toDate();
  const endUTC = end.toDate();

  // 3. Get all farmers
  const farmers = await Farmer.find();

  // 4. Get farmer IDs and fetch wallets separately
  const farmerIds = farmers.map((f) => f._id);
  const wallets = await Wallet.find({ farmer: { $in: farmerIds } });

  // Create wallet map by farmer ID
  const walletMap = new Map();
  wallets.forEach((wallet) => {
    walletMap.set(wallet.farmer.toString(), wallet);
  });

  // 5. Get milk deliveries in date range
  const milkDeliveries = await Kilo.aggregate([
    {
      $match: {
        createdAt: { $gte: startUTC, $lte: endUTC },
      },
    },
    {
      $group: {
        _id: '$farmer',
        totalWeight: { $sum: '$netUnits' },
        totalGrossPay: { $sum: '$grossPay' },
      },
    },
  ]);

  // 6. Get deductions in date range
  const deductions = await Transaction.aggregate([
    {
      $match: {
        createdAt: { $gte: startUTC, $lte: endUTC },
        type: { $in: ['loan', 'airtime_purchase', 'money_transfer'] },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$farmer',
        totalDeductions: { $sum: '$totalAmount' },
      },
    },
  ]);

  // 7. Generate report
  const report = farmers.map((farmer) => {
    const farmerIdStr = farmer._id.toString();

    // Find wallet for this farmer
    const wallet = walletMap.get(farmerIdStr);

    // Find milk deliveries
    const delivery = milkDeliveries.find((d) => d._id.equals(farmer._id)) || {
      totalWeight: 0,
      totalGrossPay: 0,
    };

    // Find deductions
    const deduction = deductions.find((d) => d._id.equals(farmer._id)) || {
      totalDeductions: 0,
    };

    // Calculate net pay
    const netPay = delivery.totalGrossPay - deduction.totalDeductions;

    return {
      farmerId: farmer._id,
      name: farmer.name,
      farmerCode: farmer.farmerCode,
      phoneNumber: farmer.phoneNumber,
      routeName: farmer.routeName,
      centreName: farmer.centreName,
      totalWeight: delivery.totalWeight,
      totalGrossPay: delivery.totalGrossPay,
      totalDeductions: deduction.totalDeductions,
      netPay,
      currentBalance: wallet ? wallet.payableAmount : 0,
      loanLimit: wallet ? wallet.loanLimit : 0,
      borrowedAmount: wallet ? wallet.borrowedAmount : 0,
      canBorrow: farmer.canBorrow,
    };
  });

  res.status(200).json({
    status: 'success',
    period: `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`,
    timezone: 'Africa/Nairobi',
    records: report.length,
    data: report,
  });
});

// exports.getPaymentReport = catchAsync(async (req, res, next) => {
//   const { startDate, endDate } = req.query;

//   // 1. Validate input dates
//   if (!startDate || !endDate) {
//     return next(new AppError('Please provide both startDate and endDate', 400));
//   }

//   // 2. Convert to Nairobi time and create UTC date range
//   const start = moment.tz(startDate, 'Africa/Nairobi').startOf('day');
//   const end = moment.tz(endDate, 'Africa/Nairobi').endOf('day');

//   if (!start.isValid() || !end.isValid()) {
//     return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
//   }

//   const startUTC = start.toDate();
//   const endUTC = end.toDate();

//   // 3. Get all farmers with their wallets
//   const farmers = await Farmer.find().populate({
//     path: 'wallet',
//     model: Wallet,
//   });

//   // 4. Get milk deliveries in date range
//   const milkDeliveries = await Kilo.aggregate([
//     {
//       $match: {
//         createdAt: { $gte: startUTC, $lte: endUTC },
//       },
//     },
//     {
//       $group: {
//         _id: '$farmer',
//         totalWeight: { $sum: '$netUnits' },
//         totalGrossPay: { $sum: '$grossPay' },
//       },
//     },
//   ]);

//   // 5. Get deductions in date range
//   const deductions = await Transaction.aggregate([
//     {
//       $match: {
//         createdAt: { $gte: startUTC, $lte: endUTC },
//         type: { $in: ['loan', 'airtime_purchase', 'money_transfer'] },
//         status: 'completed',
//       },
//     },
//     {
//       $group: {
//         _id: '$farmer',
//         totalDeductions: { $sum: '$totalAmount' },
//       },
//     },
//   ]);

//   // 6. Generate report
//   const report = farmers.map((farmer) => {
//     // Find milk deliveries for this farmer
//     const delivery = milkDeliveries.find((d) => d._id.equals(farmer._id)) || {
//       totalWeight: 0,
//       totalGrossPay: 0,
//     };

//     // Find deductions for this farmer
//     const deduction = deductions.find((d) => d._id.equals(farmer._id)) || {
//       totalDeductions: 0,
//     };

//     // Calculate net pay
//     const netPay = delivery.totalGrossPay - deduction.totalDeductions;

//     return {
//       farmerId: farmer._id,
//       name: farmer.name,
//       farmerCode: farmer.farmerCode,
//       phoneNumber: farmer.phoneNumber,
//       routeName: farmer.routeName,
//       centreName: farmer.centreName,
//       totalWeight: delivery.totalWeight,
//       totalGrossPay: delivery.totalGrossPay,
//       totalDeductions: deduction.totalDeductions,
//       netPay,
//       currentBalance: farmer.wallet ? farmer.wallet.payableAmount : 0,
//       loanLimit: farmer.wallet ? farmer.wallet.loanLimit : 0,
//       borrowedAmount: farmer.wallet ? farmer.wallet.borrowedAmount : 0,
//       canBorrow: farmer.canBorrow,
//     };
//   });

//   res.status(200).json({
//     status: 'success',
//     period: `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`,
//     timezone: 'Africa/Nairobi',
//     records: report.length,
//     data: report,
//   });
// });
