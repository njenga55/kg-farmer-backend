const express = require('express');
const farmerController = require('./../controllers/farmerController');
const authController = require('./../controllers/authController');
const ifetchController = require('./../controllers/ifetchController');

const router = express.Router();

router.post('/otp', authController.generateOtp);
router.post('/login-with-otp', authController.loginWithOTP);

router.use(authController.protect);

router.post('/set-pin', authController.setPin);
router.post('/forgot-pin', authController.forgotPin);
router.post('/verify-pin', authController.verifyPin);
router.get('/dashboardStats', farmerController.getFarmerStats);

router.use(authController.restrictTo('admin', 'super-admin', 'master'));

router
  .route('/')
  .get(farmerController.getAllFarmers)
  .post(farmerController.createFarmer);

router
  .route('/:id')
  .get(farmerController.getFarmer)
  .patch(farmerController.updateFarmer)
  .delete(farmerController.deleteFarmer);

  

module.exports = router;
