const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // Format: 'YYYY-MM-DD'

  totalLoanAmount: { type: Number, default: 0 },
  totalAirtimeAmount: { type: Number, default: 0 },
  totalTransferAmount: { type: Number, default: 0 },

  totalKgs: { type: Number, default: 0 },
  numberOfFarmersWhoBorrowed: { type: Number, default: 0 },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

dailyReportSchema.index({ date: 1 });
dailyReportSchema.index({ totalLoanAmount: 1 });
dailyReportSchema.index({ totalAirtimeAmount: 1 });
dailyReportSchema.index({ totalTransferAmount: 1 });
dailyReportSchema.index({ totalKgs: 1 });
dailyReportSchema.index({ numberOfFarmersWhoBorrowed: 1 });

const DailyReport = mongoose.model('DailyReport', dailyReportSchema);
module.exports = DailyReport;
