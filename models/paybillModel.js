const mongoose = require('mongoose');

const paybillSchema = new mongoose.Schema({
  amount: { type: Number, required: true, default: 0 },
});

const paybill = mongoose.model('Paybill', paybillSchema);

module.exports = paybill;
