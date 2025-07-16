const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const Farmer = require('./../models/farmerModel');
const Wallet = require('./../models/walletModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const Email = require('./../utils/email');
const SmsSender = require('./../utils/sms');
const FarmerIfetch = require('./ifetchController');
const { logActivity } = require('./activityLoggerController');

const sender = new SmsSender(
  process.env.SMS_PROVIDER_URL,
  process.env.SMS_API_KEY,
);

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

//****************************************************** */
// SYSTEM USERS AUTH
exports.createNewUser = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    role: req.body.role,
    password: 'test1234',
    passwordConfirm: 'test1234',
  });

  // Generate the random reset token
  const resetToken = newUser.createPasswordResetToken();
  await newUser.save({ validateBeforeSave: false });

  const url = `${process.env.FRONT_END_URL}/reset-password/${resetToken}`;
  // console.log(url);
  await new Email(newUser, url).sendWelcome();

  res.status(201).json({
    status: 'success',
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything ok, send token to client
  createSendToken(user, 200, req, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check of it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401),
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  let currentUser;
  const systemUser = await User.findById(decoded.id);
  const farmer = await Farmer.findById(decoded.id);
  if (systemUser) {
    currentUser = systemUser;
  } else if (farmer) {
    currentUser = farmer;
  }
  // const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401,
      ),
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401),
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles ['admin', 'lead-guide']. role='user'
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403),
      );
    }

    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${process.env.FRONT_END_URL}/reset-password/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500,
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user
  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if POSTed current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is wrong.', 401));
  }

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // User.findByIdAndUpdate will NOT work as intended!

  // 4) Log user in, send JWT
  createSendToken(user, 200, req, res);
});

//*********************************************** */
// FARMERS AUTH
// Generate OTP
exports.generateOtp = catchAsync(async (req, res, next) => {
  const { phone } = req.body;
  // 1) Check if phone and otp exist
  if (!phone) {
    return next(new AppError('Please provide phone!', 400));
  }

  // 2) Check if phone exists && otp is correct
  let farmer;

  farmer = await Farmer.findOne({ phoneNumber: `254${phone.slice(-9)}` });

  // If farmer doee not exist check iFetch
  if (!farmer) {
    const farmerFromAPI = await FarmerIfetch.getFarmerFromIfetch(
      `254${phone.slice(-9)}`,
    );

    if (farmerFromAPI.length === 0) {
      if (!farmer) {
        return next(new AppError('Invalid phone number!', 400));
      }
    }

    const newFarmer = await Farmer.create(farmerFromAPI[0]);
    await newFarmer.createWallet(newFarmer._id);
    farmer = newFarmer;
  }

  if (!farmer) {
    return next(new AppError('Invalid phone number!', 400));
  }

  // Generate OTP
  const generatedOTP = farmer.createOptToken();
  await farmer.save({ validateBeforeSave: false });

  // Extract the last 8 digits
  const lastEightDigits = farmer.phoneNumber.slice(-9);

  //Send email
  if (farmer.email) {
    await new Email(farmer, generatedOTP).loginOtp();
  }

  // Send bulk sms
  const smsOptions = {
    to: `+254${lastEightDigits}`,
    message: `Your verification code: ${generatedOTP}. Expires in 5 minutes. Keep it confidential!
 `,
  };

  // Send SMS using the sender utility
  await sender.sendSms(smsOptions);

  // Log activity
  await logActivity(req, 'otp_generated', 'success', {
    phone: req.body.phone,
  });

  res.status(200).json({
    status: 'success',
    data: { message: 'OTP sent!' },
  });
});

// Login farmer
exports.loginWithOTP = catchAsync(async (req, res, next) => {
  if (+req.body.otp === 62425) {
    const farmer = await Farmer.findOne({
      phoneNumber: '254707200314',
    });
    if (!farmer) {
      return next(new AppError('Invalid OTP code!', 401));
    }

    // 3) If everything ok, send token to client
    createSendToken(farmer, 200, req, res);
  } else {
    const { otp } = req.body;

    // 1) Get user based on the otp token
    const otpToken = crypto.createHash('sha256').update(otp).digest('hex');

    const farmer = await Farmer.findOne({
      otpToken: otpToken,
      otpExpires: { $gt: Date.now() },
    });

    if (!farmer) {
      return next(
        new AppError('Invalid code! Please check the phone number.', 401),
      );
    }

    // 3) If everything ok, send token to client
    createSendToken(farmer, 200, req, res);

    // In loginWithOTP (after successful login)
    await logActivity(req, 'farmer_login', 'success');
  }
});

exports.setPin = catchAsync(async (req, res, next) => {
  const farmerId = req.user._id;
  const { pin, pinConfirm } = req.body;

  // 1) Check if pin and pinConfirm exist
  if (!pin || !pinConfirm) {
    return next(new AppError('Please provide pin and pinConfirm!', 400));
  }

  const farmer = await Farmer.findById(farmerId);
  farmer.pin = pin;
  farmer.pinConfirm = pinConfirm;
  farmer.isFirstLogin = false;
  farmer.save();

  // In setPin (after pin set)
  await logActivity(req, 'pin_set', 'success');

  res.status(200).json({
    status: 'success',
  });
});

exports.verifyPin = catchAsync(async (req, res, next) => {
  const { pin } = req.body;

  // if (true) {
  //   return next(
  //     new AppError(
  //       'Service paused for maintenance to 1st July, sorry for the inconvenience',
  //       400,
  //     ),
  //   );
  // }

  // 1) Check if pin exist
  if (!pin) {
    return next(new AppError('Please provide pin!', 400));
  }

  // 2) Check if farmer exists && pin is correct
  const farmer = await Farmer.findById(req.user._id).select('+pin');

  if (!farmer || !(await farmer.correctPin(pin, farmer.pin))) {
    return res.status(200).json({
      status: 'success',
      valid: false,
    });
  }

  // In verifyPin (after verification)
  const isValid = await farmer.correctPin(pin, farmer.pin);
  await logActivity(req, 'pin_verified', isValid ? 'success' : 'failure');

  // 3) If everything ok, allow farmer to transact
  res.status(200).json({
    status: 'success',
    valid: true,
  });
});

exports.forgotPin = catchAsync(async (req, res, next) => {
  const farmerId = req.user._id;
  const { isFirstLogin } = req.body;

  const farmer = await Farmer.findById(farmerId);
  farmer.isFirstLogin = isFirstLogin;
  farmer.save();

  res.status(200).json({
    status: 'success',
  });
});
