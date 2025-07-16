const mongoose = require('mongoose');
// const Wallet = require('./walletModel');

const kiloSchema = new mongoose.Schema({
  recordID: { type: Number, required: true, unique: true },
  farmerCode: { type: String, required: true },
  farmer: { type: mongoose.Schema.ObjectId, ref: 'Farmer', required: true },
  transTime: { type: String, required: true },
  idNumber: { type: String, required: true },
  transCode: { type: String, required: true },
  routeCode: { type: String },
  routeName: { type: String },
  centreCode: { type: String },
  centreName: { type: String },
  netUnits: { type: Number, required: true },
  paymentRate: { type: Number, required: true },
  grossPay: { type: Number, required: true },
  transportCost: { type: Number, required: true },
  transportRecovery: { type: Number, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

kiloSchema.index({ recordID: 1 }, { unique: true });
kiloSchema.index({ farmer: 1, transTime: 1 });

// kiloSchema.post('save', async function (doc) {
//   const session = await mongoose.startSession();

//   try {
//     await session.withTransaction(async () => {
//       const weight = parseFloat(doc.netUnits.toFixed(2));
//       const earningsAmount = parseFloat(doc.grossPay.toFixed(2));
//       const loanLimit = parseFloat((doc.grossPay / 2).toFixed(2));
//       const payableAmount = parseFloat(doc.grossPay.toFixed(2));

//       const result = await Wallet.updateOne(
//         { farmer: doc.farmer },
//         {
//           $inc: {
//             weight,
//             earningsAmount,
//             loanLimit,
//             payableAmount,
//           },
//         },
//         { session }, // 👈 Ensure update is part of the transaction
//       );

//       if (result.modifiedCount === 0) {
//         throw new Error('Wallet update failed: No document modified');
//       }
//     });
//   } catch (error) {
//     console.error('Transaction failed:', error);
//   } finally {
//     session.endSession();
//   }
// });

// kiloSchema.post('save', async function (doc) {
//   try {
//     const weight = parseFloat(doc.netUnits.toFixed(2));
//     const earningsAmount = parseFloat(doc.grossPay.toFixed(2));
//     const loanLimit = parseFloat((doc.grossPay / 2).toFixed(2));
//     const payableAmount = parseFloat(doc.grossPay.toFixed(2));

//     await Wallet.updateOne(
//       { farmer: doc.farmer },
//       {
//         $inc: {
//           weight,
//           earningsAmount,
//           loanLimit,
//           payableAmount,
//         },
//       },
//     );
//   } catch (error) {
//     console.error('Error updating wallet:', error);
//   }
// });

kiloSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'farmer',
    select: '-_id name farmerCode phoneNumber idNumber',
  });
  next();
});

const Kilo = mongoose.model('Kilo', kiloSchema);
module.exports = Kilo;

// const mongoose = require('mongoose');
// const Wallet = require('./walletModel');
// // const Farmer = require('./farmerModel');

// const kiloSchema = new mongoose.Schema({
//   recordID: {
//     type: Number,
//     required: true,
//     unique: true,
//   },
//   farmerCode: {
//     type: String,
//     required: true,
//   },
//   farmer: {
//     type: mongoose.Schema.ObjectId,
//     ref: 'Farmer',
//     required: true,
//   },
//   transTime: {
//     type: String,
//     required: true,
//   },
//   idNumber: {
//     type: String,
//     required: true,
//   },
//   transCode: {
//     type: String,
//     required: true,
//   },
//   routeCode: {
//     type: String,
//   },
//   routeName: {
//     type: String,
//   },
//   centreCode: {
//     type: String,
//   },
//   centreName: {
//     type: String,
//   },
//   netUnits: {
//     type: Number,
//     required: true,
//   },
//   paymentRate: {
//     type: Number,
//     required: true,
//   },
//   grossPay: {
//     type: Number,
//     required: true,
//   },
//   transportCost: {
//     type: Number,
//     required: true,
//   },
//   transportRecovery: {
//     type: Number,
//     required: true,
//   },
//   createdAt: {
//     type: Date,
//     required: true,
//     default: Date.now,
//   },
// });

// // kiloSchema .index({ farmer: 1, transTime: 1 }, { unique: true });
// kiloSchema.index({ recordID: 1 }, { unique: true });
// kiloSchema.index({ farmer: 1, transTime: 1 });

// kiloSchema.post('save', async function (doc) {
//   try {
//     const weight = parseFloat(doc.netUnits.toFixed(2));
//     const earningsAmount = parseFloat(doc.grossPay.toFixed(2));
//     const loanLimit = parseFloat((doc.grossPay / 2).toFixed(2));
//     const payableAmount = parseFloat(doc.grossPay.toFixed(2));

//     await Wallet.updateOne(
//       { farmer: doc.farmer },
//       {
//         $inc: {
//           weight: weight,
//           earningsAmount: earningsAmount,
//           loanLimit: loanLimit,
//           payableAmount: payableAmount,
//         },
//       },
//     );
//   } catch (error) {
//     console.error('Error updating wallet:', error);
//   }
// });

// kiloSchema.pre(/^find/, function (next) {
//   this.populate({
//     path: 'farmer',
//     select: '-_id name farmerCode phoneNumber idNumber',
//   });
//   next();
// });

// const kilo = mongoose.model('Kilo', kiloSchema);

// module.exports = kilo;
