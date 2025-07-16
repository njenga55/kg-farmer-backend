const express = require('express');
const reportController = require('./../controllers/reportController');
const deductionController = require('./../controllers/deductionController');
const {
  getAllDailyReports,
} = require('./../controllers/dailyReportController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router.use(authController.restrictTo('admin', 'super-admin', 'master'));

router.get('/daily-reports', getAllDailyReports);

router.get('/payment-report', deductionController.getPaymentReport);

router.get('/', reportController.getFinancialReports);

router.get('/export-farmers', reportController.exportFarmersReport);

module.exports = router;
