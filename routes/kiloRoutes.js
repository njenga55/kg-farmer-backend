const express = require('express');
const kiloController = require('./../controllers/kiloController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router.get('/myKilos', kiloController.getAllFarmerKilos);

router.use(authController.restrictTo('admin', 'super-admin', 'master'));

router
  .route('/')
  .get(kiloController.getAllKilos)
  .post(kiloController.createKilo);

router
  .route('/:id')
  .get(kiloController.getKilo)
  .patch(kiloController.updateKilo)
  .delete(kiloController.deleteKilo);

module.exports = router;
