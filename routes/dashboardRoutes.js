const express = require('express');
const dashboardController = require('./../controllers/dashboardController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router.use(authController.restrictTo('admin', 'super-admin', 'master'));

router.get('/stats', dashboardController.getFarmerStats);

module.exports = router;
