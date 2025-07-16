const { Parser } = require('json2csv');
const Farmer = require('./../models/farmerModel');
const Transaction = require('./../models/transactionModel');
const catchAsync = require('./../utils/catchAsync');

// Reports
exports.getFinancialReports = catchAsync(async (req, res, next) => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Helper function to create period aggregation
  const createPeriodAggregation = (startDate) => [
    {
      $match: {
        createdAt: { $gte: startDate },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$type',
        totalCharges: { $sum: '$charge' },
        totalAmount: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        totalCharges: { $sum: '$totalCharges' },
        totalAmount: { $sum: '$totalAmount' },
        breakdown: {
          $push: {
            k: '$_id',
            v: {
              totalCharges: '$totalCharges',
              totalAmount: '$totalAmount',
              count: '$transactionCount',
            },
          },
        },
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            {
              totalCharges: '$totalCharges',
              totalAmount: '$totalAmount',
            },
            { $arrayToObject: '$breakdown' },
          ],
        },
      },
    },
  ];

  const [
    dailyProfit,
    weeklyProfit,
    monthlyProfit,
    topFarmers,
    totalBorrowers,
    allTimeTotal,
  ] = await Promise.all([
    Transaction.aggregate(createPeriodAggregation(startOfDay)),
    Transaction.aggregate(createPeriodAggregation(startOfWeek)),
    Transaction.aggregate(createPeriodAggregation(startOfMonth)),
    // Keep the rest of the aggregations the same
    Transaction.aggregate([
      {
        $match: { status: 'completed' },
      },
      {
        $group: {
          _id: '$farmer',
          totalCharges: { $sum: '$charge' },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalCharges: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'farmers',
          localField: '_id',
          foreignField: '_id',
          as: 'farmer',
        },
      },
      { $unwind: '$farmer' },
      {
        $project: {
          name: '$farmer.name',
          farmerCode: '$farmer.farmerCode',
          totalCharges: 1,
          transactionCount: 1,
        },
      },
    ]),
    Transaction.distinct('farmer'),
    Transaction.aggregate([
      {
        $match: { status: 'completed' },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$charge' },
        },
      },
    ]),
  ]);

  // Format the response
  res.status(200).json({
    status: 'success',
    data: {
      dailyProfit: formatProfitData(dailyProfit),
      weeklyProfit: formatProfitData(weeklyProfit),
      monthlyProfit: formatProfitData(monthlyProfit),
      topFarmers,
      totalBorrowers: totalBorrowers.length,
      allTimeTotal: allTimeTotal[0]?.total || 0,
    },
  });
});

// Export CSV
exports.exportFarmersReport = catchAsync(async (req, res, next) => {
  const { period } = req.query;
  const today = new Date();

  // Date calculations
  let startDate;
  switch (period) {
    case 'today':
      startDate = new Date(today.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(today.setDate(today.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    default:
      startDate = null;
  }

  const matchStage = startDate
    ? {
        createdAt: { $gte: startDate },
      }
    : {};

  const aggregation = [
    {
      $match: matchStage,
    },
    {
      $lookup: {
        from: 'wallets',
        localField: '_id',
        foreignField: 'farmer',
        as: 'wallet',
      },
    },
    { $unwind: '$wallet' },
    {
      $project: {
        _id: 0,
        name: 1,
        idNumber: 1,
        phoneNumber: 1,
        kgsLoaded: '$wallet.weight',
        limit: {
          $divide: [{ $multiply: ['$wallet.weight', 24] }, 2],
        },
        borrowed: '$wallet.borrowedAmount',
        availableLimit: '$wallet.loanLimit',
        // availableLimit: {
        //   $subtract: ['$wallet.loanLimit', '$wallet.borrowedAmount'],
        // },
        payableAmount: '$wallet.payableAmount',
      },
    },
  ];

  const farmers = await Farmer.aggregate(aggregation);

  // CSV configuration
  const fields = [
    'name',
    'idNumber',
    'phoneNumber',
    'kgsLoaded',
    'limit',
    'borrowed',
    'availableLimit',
    'payableAmount',
  ];

  const parser = new Parser({ fields });
  const csv = parser.parse(farmers);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=farmers-report.csv',
  );
  res.status(200).send(csv);
});

// Modified helper function
function formatProfitData(aggregationResult) {
  const result = aggregationResult[0] || {};
  return {
    totalCharges: result.totalCharges || 0,
    totalAmount: result.totalAmount || 0,
    breakdown: {
      loan: {
        charges: result.loan?.totalCharges || 0,
        amount: result.loan?.totalAmount || 0,
        count: result.loan?.count || 0,
      },
      money_transfer: {
        charges: result.money_transfer?.totalCharges || 0,
        amount: result.money_transfer?.totalAmount || 0,
        count: result.money_transfer?.count || 0,
      },
      airtime_purchase: {
        charges: result.airtime_purchase?.totalCharges || 0,
        amount: result.airtime_purchase?.totalAmount || 0,
        count: result.airtime_purchase?.count || 0,
      },
    },
  };
}
