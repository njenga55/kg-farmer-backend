const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  farmer: {
    type: mongoose.Schema.ObjectId,
    ref: 'Farmer',
    required: true,
  },
  wallet: {
    type: mongoose.Schema.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  type: {
    type: String,
    enum: ['loan', 'airtime_purchase', 'money_transfer'],
    required: true,
  },
  transactionQueueId: { type: String },
  amount: { type: Number, required: true },
  charge: { type: Number }, // Added field
  totalAmount: { type: Number }, // Added field
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  // Airtime purchase-specific fields
  airtimeDetails: {
    provider: { type: String }, // Airtime provider name
    recipientPhoneNumber: { type: String }, // Phone number for the airtime purchase
  },

  // Money transfer-specific fields
  transferDetails: {
    recipientPhoneNumber: { type: String }, // Phone number of the transfer recipient
  },

  // Description or notes for any additional information
  description: { type: String },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

transactionSchema.index({ type: 1 });

transactionSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'farmer',
    select: '-_id name farmerCode phoneNumber idNumber',
  }).populate({
    path: 'wallet',
    select: '-_id earningsAmount loanLimit borrowedAmount',
  });
  next();
});

const transaction = mongoose.model('Transaction', transactionSchema);

module.exports = transaction;
