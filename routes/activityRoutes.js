const express = require('express');
const activityLoggerController = require('../controllers/activityLoggerController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router.use(authController.restrictTo('admin', 'super-admin', 'master'));

router.get('/', activityLoggerController.getAllActivities);

module.exports = router;
