const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const generateOTP = require('../utils/otp');
const catchAsync = require('../utils/catchAsync');
const Wallet = require('./walletModel');

const farmerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  farmerCode: {
    type: String,
    required: [true, 'Please provide farmerCode'],
    unique: true,
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please provide farmer phoneNumber'],
    unique: true,
  },
  idNumber: {
    type: String,
    required: [true, 'Please provide farmer idNumber'],
    unique: true,
  },
  routeCode: String,
  routeName: String,
  centreCode: String,
  centreName: String,
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  passwordChangedAt: Date,
  otpChangedAt: Date,
  otpToken: String,
  otpExpires: Date,

  // PIN implementation
  isFirstLogin: {
    type: Boolean,
    default: true,
  },
  pin: {
    type: String,
    minlength: 4,
    select: false,
  },
  pinConfirm: {
    type: String,
    validate: {
      // This only works on CREATE and SAVE!!!
      validator: function (el) {
        return el === this.pin;
      },
      message: 'Pin is not the same!',
    },
  },

  // Borrowing
  canBorrow: {
    required: true,
    type: Boolean,
    default: true,
  },
});

farmerSchema.pre('save', async function (next) {
  // Only run this function if pin was actually modified
  if (!this.isModified('pin')) return next();

  // Hash the pin with cost of 12
  this.pin = await bcrypt.hash(this.pin, 12);

  // Delete pinConfirm field
  this.pinConfirm = undefined;
  next();
});

farmerSchema.methods.correctPin = async function (candidatePin, userPin) {
  return await bcrypt.compare(candidatePin, userPin);
};

farmerSchema.statics.deleteWallet = catchAsync(async function (farmer) {
  await Wallet.findOneAndDelete({ farmer });
});

// findByIdAndDelete
farmerSchema.pre(/^findOneAndDelete/, async function (next) {
  this._docToDelete = await this.model.findById(this.getQuery()['_id']);
  next();
});

farmerSchema.post(/^findOneAndDelete/, async function () {
  await this._docToDelete.constructor.deleteWallet(this._docToDelete._id);
});

farmerSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );

    return JWTTimestamp < changedTimestamp;
  }

  // False means NOT changed
  return false;
};

farmerSchema.methods.createWallet = async function (farmer) {
  await Wallet.create({ farmer });
};

farmerSchema.methods.createOptToken = function () {
  const otpToken = generateOTP();

  this.otpToken = crypto.createHash('sha256').update(otpToken).digest('hex');

  this.otpExpires = Date.now() + 5 * 60 * 1000;

  return otpToken;
};

const farmer = mongoose.model('Farmer', farmerSchema);

module.exports = farmer;
