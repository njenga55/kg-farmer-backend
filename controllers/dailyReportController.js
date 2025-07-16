const Transaction = require('../models/transactionModel');
const Kilo = require('../models/kiloModel');
const DailyReport = require('../models/dailyReportModel');
const moment = require('moment-timezone');
const factory = require('./handlerFactory');

const generateDailyReports = async () => {
  try {
    const today = moment().tz('Africa/Nairobi');
    const reports = [];

    // Only run for days 1-25
    if (today.date() > 25) {
      console.log('❌ Not within the reporting range (1-25)');
      return;
    }

    for (let day = 1; day <= today.date(); day++) {
      const dateStr = today.clone().date(day).format('YYYY-MM-DD');

      const exists = await DailyReport.findOne({ date: dateStr });
      if (exists) continue; // Skip if already recorded

      const start = today.clone().date(day).startOf('day').toDate();
      const end = today.clone().date(day).endOf('day').toDate();

      // Transactions
      const [loans, airtimes, transfers] = await Promise.all([
        Transaction.aggregate([
          {
            $match: {
              type: 'loan',
              status: 'completed',
              createdAt: { $gte: start, $lte: end },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
              farmers: { $addToSet: '$farmer' },
            },
          },
        ]),
        Transaction.aggregate([
          {
            $match: {
              type: 'airtime_purchase',
              status: 'completed',
              createdAt: { $gte: start, $lte: end },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          {
            $match: {
              type: 'money_transfer',
              status: 'completed',
              createdAt: { $gte: start, $lte: end },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      // Kilos
      const kiloData = await Kilo.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: null,
            totalKgs: { $sum: '$netUnits' },
          },
        },
      ]);

      const report = new DailyReport({
        date: dateStr,
        totalLoanAmount: loans[0]?.total || 0,
        numberOfFarmersWhoBorrowed: loans[0]?.farmers.length || 0,
        totalAirtimeAmount: airtimes[0]?.total || 0,
        totalTransferAmount: transfers[0]?.total || 0,
        totalKgs: kiloData[0]?.totalKgs || 0,
      });

      await report.save();
      reports.push(report);
      console.log(`✅ Saved daily report for ${dateStr}`);
    }

    return reports.length
      ? { success: true, message: `Generated ${reports.length} reports.` }
      : { success: true, message: 'No pending reports to generate.' };
  } catch (error) {
    console.error('❌ Error generating daily reports:', error);
    return { success: false, message: error.message };
  }
};

const getAllDailyReports = factory.getAll(DailyReport);

module.exports = { generateDailyReports, getAllDailyReports };
