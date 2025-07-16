const mongoose = require('mongoose');

const automationSchema = new mongoose.Schema({
  status: {
    type: Boolean,
    default: 2,
    // select: false,
  },
});

const Automation = mongoose.model('Automation', automationSchema);

module.exports = Automation;
