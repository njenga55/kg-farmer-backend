const mongoose = require('mongoose');

const toFixed2 = (val) =>
  typeof val === 'number' ? Number(val.toFixed(2)) : val;

const walletSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    weight: {
      type: Number,
      default: 0,
      get: toFixed2,
    },
    earningsAmount: {
      type: Number,
      required: true,
      default: 0,
      get: toFixed2,
    },
    loanLimit: {
      type: Number,
      required: true,
      default: 0,
      get: toFixed2,
    },
    borrowedAmount: {
      type: Number,
      required: true,
      default: 0,
      // Optional: round this too if needed
      get: toFixed2,
    },
    payableAmount: {
      type: Number,
      required: true,
      default: 0,
      get: toFixed2,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

walletSchema.index({ farmer: 1 });

const wallet = mongoose.model('Wallet', walletSchema);

module.exports = wallet;

// const mongoose = require('mongoose');

// const walletSchema = new mongoose.Schema({
//   farmer: {
//     type: mongoose.Schema.ObjectId,
//     ref: 'Farmer',
//     required: true,
//   },
//   weight: {
//     type: Number,
//     default: 0,
//   },
//   earningsAmount: {
//     type: Number,
//     required: true,
//     default: 0,
//   },
//   loanLimit: {
//     type: Number,
//     required: true,
//     default: 0,
//   },
//   borrowedAmount: {
//     type: Number,
//     required: true,
//     default: 0,
//   },
//   payableAmount: {
//     type: Number,
//     required: true,
//     default: 0,
//   },
//   createdAt: {
//     type: Date,
//     required: true,
//     default: Date.now,
//   },
// });

// walletSchema.index({ farmer: 1 });

// const wallet = mongoose.model('Wallet', walletSchema);

// module.exports = wallet;
