const mongoose = require('mongoose');

const transactionQueueSchema = new mongoose.Schema({
  txnRef: {
    // Transaction Reference
    type: String,
    // required: true,
    unique: true,
  },
  wallet: {
    type: mongoose.Schema.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  transactionType: {
    type: String,
    required: true,
  },
  isNotified: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  isComplete: {
    type: Boolean,
    default: false,
  },
  description: { type: String },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

transactionQueueSchema.index({ txnRef: 1 });
transactionQueueSchema.index({ transactionType: 1 });

const transactionQueue = mongoose.model(
  'TransactionQueue',
  transactionQueueSchema,
);

module.exports = transactionQueue;
