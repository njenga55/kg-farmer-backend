const express = require('express');
const transactionController = require('./../controllers/transactionController');
const authController = require('./../controllers/authController');

const router = express.Router();

// CALLBACK URLS FROM SAFARICOM MPESA
router.post('/loanRequestCallback', transactionController.loanRequestCallback);
router.post(
  '/moneyTransferCallback',
  transactionController.moneyTransferCallback,
);
router.post(
  '/paybillBalanceCallback',
  transactionController.paybillBalanceCallback,
);
router.post('/b2bCallback', transactionController.B2bCallback);

router.use(authController.protect);
router.post('/loan-request', transactionController.loanRequest);
router.post('/airtime-purchase', transactionController.airtimePurchase);
router.post('/money-transfer', transactionController.moneyTransfer);
router.get('/paybill-balance', transactionController.paybillBalance);
router.get(
  '/farmer-transactions/:id',
  transactionController.getFarmerTransactions,
);

router.get('/myTransactions', transactionController.getAllFarmerTransactions);

router.use(authController.restrictTo('admin', 'super-admin'));
router.route('/').get(transactionController.getAllTransactions);

router
  .route('/:id')
  .get(transactionController.getTransaction)
  .patch(transactionController.updateTransaction)
  .delete(transactionController.deleteTransaction);

module.exports = router;
