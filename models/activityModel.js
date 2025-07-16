const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ['success', 'failure'],
      required: true,
    },
    details: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

activitySchema.pre(/^find/, function (next) {
  this.populate({
    path: 'farmer',
    select: '-_id name farmerCode phoneNumber idNumber',
  });
  next();
});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
