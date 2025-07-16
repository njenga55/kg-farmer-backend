const Activity = require('../models/activityModel');
const factory = require('./handlerFactory');

exports.logActivity = async (req, action, status, details = {}) => {
  try {
    const farmer = req.user;
    if (!farmer) return;

    await Activity.create({
      farmer: farmer._id,
      action,
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress:
        req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      status,
      details,
    });
  } catch (err) {
    console.error('Activity logging failed:', err.message);
  }
};

exports.getAllActivities = factory.getAll(Activity);
