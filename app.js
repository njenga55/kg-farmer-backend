const path = require('path');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const viewRouter = require('./routes/viewRoutes');
const userRouter = require('./routes/userRoutes');
const farmerRouter = require('./routes/farmerRoutes');
const kiloRouter = require('./routes/kiloRoutes');
const transactionRouter = require('./routes/transactionRoutes');
const dashboardRouter = require('./routes/dashboardRoutes');
const reportRouter = require('./routes/reportRoutes');
const activityRouter = require('./routes/activityRoutes');

// const { resetMonthlyFields } = require('./controllers/walletResetController');

// Start express app
const app = express();
const pino = require('pino-http')()


app.enable('trust proxy');

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// 1) GLOBAL MIDDLEWARES
// Implement CORS
app.use(cors());

app.options('*', cors());
// app.options('/api/v1/tours/:id', cors());

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Set security HTTP headers
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: ['amount'],
  }),
);
// Pino for Logging

app.use(compression());

// 3) ROUTES
app.use('/', viewRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/farmers', farmerRouter);
app.use('/api/v1/kilos', kiloRouter);
app.use('/api/v1/transactions', transactionRouter);
app.use('/api/v1/dashboards', dashboardRouter);
app.use('/api/v1/reports', reportRouter);
app.use('/api/v1/activities', activityRouter);

// Test endpoint for manual reset (optional)
// app.get('/test-reset', async (req, res) => {
//   const result = await resetMonthlyFields();
//   res.json(result);
// });

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
