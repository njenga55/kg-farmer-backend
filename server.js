const http = require('http');
const cron = require('node-cron');
const io = require('socket.io');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const Automation = require('./models/automationModel'); // Adjust the path
const { resetMonthlyFields } = require('./controllers/walletResetController');
const { generateDailyReports } = require('./controllers/dailyReportController');
const axios = require('axios');


process.env.TZ = 'Africa/Nairobi'; // Set timezone to EAT (UTC+3)

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: './config.env' });

const apiServer = require('./app');
const httpServer = http.createServer(apiServer);

// Enable CORS for Socket.IO
const socketServer = io(httpServer, {
  cors: {
    origin: '*', // Replace '*' with your frontend origin for production
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true, // If you need to support cookies or authorization
  },
});

const sockets = require('./sockets');

// const DB = process.env.DATABASE_LOCAL;

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD,
);

mongoose.connect(DB).then(() => {
  console.log('DB connection successful!');
  sockets.listen(socketServer);
});

// Daily Report Cron Job (Runs 23:59 in EAT)
cron.schedule(
  '59 23 * * *',
  async () => {
    console.log(
      `📊 Running daily report job at ${moment()
        .tz('Africa/Nairobi')
        .format('YYYY-MM-DD HH:mm:ss')}`,
    );
    await generateDailyReports();
  },
  {
    scheduled: true,
    timezone: 'Africa/Nairobi',
  },
);
// con to fetch and save kilos for ifetch
require('./job/transactionsJob');
// cron to reset farmer borrowing limits every day at 00:00 in EAT
// require('./job/loanJob');
// Monthly Reset Cron Job (Runs at 00:00 on 1st of every month in EAT)
// cron.schedule(
//   '0 0 1 * *',
//   async () => {
//     console.log(
//       `🕒 Running monthly reset at ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`,
//     );
//     await resetMonthlyFields();
//   },
//   {
//     scheduled: true,
//     timezone: 'Africa/Nairobi',
//   },
// );

// Toggle Automation Status every 5 minutes (adjust as needed)
// cron.schedule(
//   '*/5 * * * *',
//   async () => {
//     const doc = await Automation.findOne();

//     if (doc) {
//       doc.status = !doc.status;
//       await doc.save();
//       console.log(`🔁 Automation toggled to: ${doc.status}`);
//     } else {
//       await Automation.create({});
//       console.log('⚙️ Automation document created');
//     }
//   },
//   {
//     scheduled: true,
//     timezone: 'Africa/Nairobi',
//   },
// );





const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`App running on port ${PORT}...`);
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  httpServer.close(() => {
    process.exit(1);
  });
});
