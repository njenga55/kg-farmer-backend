const axios = require('axios');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const catchAsync = require('./../utils/catchAsync');
const Farmer = require('./../models/farmerModel');
const Kilo = require('./../models/kiloModel');

mongoose
  .connect(
    'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority',
  )
  .then(() => {
    console.log('DB connection successful!');
  });

// JWT Login and Token Management
let jwtToken;
let tokenExpiry;

const login = async () => {
  const response = await axios.post(
    'https://ifetch.tetteafactory.com:9443/api/account/login',
    {
      username: 'isaac-crystalgate',
      password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
    },
  );

  jwtToken = response.data.token;
  tokenExpiry = new Date(response.data.expiresat).getTime(); // Parse expiration time
};

// Middleware to refresh token if expired
const getToken = async () => {
  if (!jwtToken || Date.now() >= tokenExpiry) {
    await login();
  }
  return jwtToken;
};

const getCurrentMonthUTCRange = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  // Start: First day of month at 00:00 EAT (UTC+3) in UTC
  const start = new Date(Date.UTC(year, month, 1, -3, 0, 0, 0));

  // End: ACTUAL current time (no offset needed)
  const end = new Date(now);

  return {
    start: start.toISOString(), // e.g., "2025-04-30T21:00:00.000Z" (May 1, 00:00 EAT)
    end: end.toISOString(), // e.g., "2025-05-29T10:00:00.000Z" (current UTC)
  };
};

const fetchKilos = catchAsync(async (req, res, next) => {
  const token = await getToken();
  const farmers = await Farmer.find({});
  const { start: monthStart, end: monthEnd } = getCurrentMonthUTCRange();
  const start = moment().tz('Africa/Nairobi').startOf('month').toISOString();
  const end = moment().tz('Africa/Nairobi').toISOString();
  console.log(token);
  console.log(farmers.length, 'farmers found');
  console.log(`Fetching kilos from ${monthStart} to ${monthEnd}`);
  console.log(`Fetching kilos from using moment-zone ${start} to ${end}`);
  // for (const farmer of farmers) {
  //   console.log(farmer.farmerCode, 'farmer code');
  // }
  return;
});

fetchKilos();
