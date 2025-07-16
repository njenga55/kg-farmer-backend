const mongoose = require('mongoose');
const fs = require('fs');
const { Parser } = require('json2csv');
const path = require('path');

// Models
const Farmer = require('./farmerModel');
const Wallet = require('./walletModel');
const Transaction = require('./transactionModel');
const Kilo = require('./kiloModel');

// Connect to MongoDB
mongoose
  .connect(
    'mongodb+srv://admin:4FYi9LP9iMxOHDPW@cluster0.knzt2.mongodb.net/kg-farmers?retryWrites=true&w=majority',
  )
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Connection error:', err));

const generateCSV = async () => {
  try {
    // Date range for the report
    const startDate = new Date('2025-04-01T00:00:00.000Z');
    const endDate = new Date('2025-04-25T23:59:59.999Z');

    console.log('Starting data aggregation...');

    // 1. Get all loan transactions in the period for summary stats
    const loanTransactions = await Transaction.find({
      type: 'loan',
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed',
    })
      .select('amount charge createdAt farmer')
      .lean();

    // Calculate summary statistics
    const summary = {
      totalBorrowed: loanTransactions.reduce(
        (sum, tx) => sum + (tx.amount || 0),
        0,
      ),
      totalCharges: loanTransactions.reduce(
        (sum, tx) => sum + (tx.charge || 0),
        0,
      ),
      totalTransactions: loanTransactions.length,
      averageLoanSize:
        loanTransactions.length > 0
          ? loanTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) /
            loanTransactions.length
          : 0,
    };
    summary.totalProfit = summary.totalCharges; // Assuming charges represent profit

    // 2. Get farmers who have loan transactions with their first and last loan dates
    const farmersWithLoans = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$farmer',
          firstLoanDate: { $min: '$createdAt' },
          lastLoanDate: { $max: '$createdAt' },
          loanCount: { $sum: 1 },
        },
      },
    ]);

    if (farmersWithLoans.length === 0) {
      throw new Error('No loan transactions found in the specified date range');
    }

    const farmerIds = farmersWithLoans.map((f) => f._id);

    // Create a map for loan dates
    const loanDatesMap = farmersWithLoans.reduce((acc, farmer) => {
      acc[farmer._id] = {
        firstLoanDate: farmer.firstLoanDate,
        lastLoanDate: farmer.lastLoanDate,
        loanCount: farmer.loanCount,
      };
      return acc;
    }, {});

    // 3. Get all necessary data in optimized queries
    const [farmers, kilosAggregation, wallets] = await Promise.all([
      Farmer.find({ _id: { $in: farmerIds } })
        .select('name idNumber phoneNumber farmerCode')
        .lean(),

      Kilo.aggregate([
        {
          $match: {
            farmer: { $in: farmerIds },
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: '$farmer',
            totalKgs: { $sum: '$netUnits' },
          },
        },
      ]),

      Wallet.find({ farmer: { $in: farmerIds } })
        .select('farmer loanLimit borrowedAmount payableAmount')
        .lean(),
    ]);

    // Create lookup maps
    const farmerMap = farmers.reduce((acc, farmer) => {
      acc[farmer._id] = farmer;
      return acc;
    }, {});

    const kgsMap = kilosAggregation.reduce((acc, item) => {
      acc[item._id] = item.totalKgs;
      return acc;
    }, {});

    const walletMap = wallets.reduce((acc, wallet) => {
      acc[wallet.farmer] = wallet;
      return acc;
    }, {});

    // 4. Prepare the final dataset
    const rows = farmerIds
      .map((farmerId) => {
        const farmer = farmerMap[farmerId];
        const wallet = walletMap[farmerId];
        const kgsLoaded = kgsMap[farmerId] || 0;
        const loanDates = loanDatesMap[farmerId];

        if (!farmer || !wallet || !loanDates) {
          console.warn(`Missing data for farmer ${farmerId}`);
          return null;
        }

        const availableLimit = Math.max(
          0,
          (wallet.loanLimit || 0) - (wallet.borrowedAmount || 0),
        );

        // Format dates for CSV
        const formatDate = (date) =>
          date ? new Date(date).toLocaleDateString() : 'N/A';

        return {
          name: farmer.name,
          idNumber: farmer.idNumber,
          phoneNumber: farmer.phoneNumber,
          farmerCode: farmer.farmerCode,
          kgsLoaded: kgsLoaded,
          limit: wallet.loanLimit || 0,
          borrowed: wallet.borrowedAmount || 0,
          availableLimit: availableLimit,
          payableAmount: wallet.payableAmount || 0,
          utilizationRate: wallet.loanLimit
            ? ((wallet.borrowedAmount / wallet.loanLimit) * 100).toFixed(2) +
              '%'
            : '0%',
          firstLoanDate: formatDate(loanDates.firstLoanDate),
          lastLoanDate: formatDate(loanDates.lastLoanDate),
          loanCount: loanDates.loanCount,
        };
      })
      .filter((row) => row !== null);

    if (rows.length === 0) {
      throw new Error('No complete data records found after processing');
    }

    // 5. Generate CSV with summary
    const fields = [
      'name',
      'idNumber',
      'phoneNumber',
      'farmerCode',
      'kgsLoaded',
      'limit',
      'borrowed',
      'availableLimit',
      'payableAmount',
      'utilizationRate',
      'firstLoanDate',
      'lastLoanDate',
      'loanCount',
    ];

    const json2csvParser = new Parser({ fields });
    let csv = json2csvParser.parse(rows);

    // Add summary section
    csv += `\n\nSUMMARY STATISTICS\n`;
    csv += `Total Borrowed Amount,${summary.totalBorrowed.toFixed(2)}\n`;
    csv += `Total Profit (Charges),${summary.totalProfit.toFixed(2)}\n`;
    csv += `Total Loan Transactions,${summary.totalTransactions}\n`;
    csv += `Average Loan Size,${summary.averageLoanSize.toFixed(2)}\n`;

    // 6. Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportsDir = path.join(__dirname, 'reports');

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }

    const filename = path.join(
      reportsDir,
      `farmer_loans_report_with_summary_${timestamp}.csv`,
    );
    fs.writeFileSync(filename, csv);

    console.log('\nREPORT SUMMARY:');
    console.log('---------------');
    console.log(`Total Borrowed: ${summary.totalBorrowed.toFixed(2)}`);
    console.log(`Total Profit: ${summary.totalProfit.toFixed(2)}`);
    console.log(`Transactions: ${summary.totalTransactions}`);
    console.log(`Average Loan: ${summary.averageLoanSize.toFixed(2)}`);
    console.log(`\nSuccessfully generated report with ${rows.length} records`);
    console.log(`Saved to: ${filename}`);

    return { filename, summary };
  } catch (error) {
    console.error('\nError generating report:', error.message);
    throw error;
  }
};

// const generateCSV = async () => {
//   try {
//     // Date range for the report
//     const startDate = new Date('2025-04-01T00:00:00.000Z');
//     const endDate = new Date('2025-04-25T23:59:59.999Z');

//     console.log('Starting data aggregation...');

//     // 1. Get all loan transactions in the period for summary stats
//     const loanTransactions = await Transaction.find({
//       type: 'loan',
//       createdAt: { $gte: startDate, $lte: endDate },
//       status: 'completed',
//     })
//       .select('amount charge')
//       .lean();

//     // Calculate summary statistics
//     const summary = {
//       totalBorrowed: loanTransactions.reduce(
//         (sum, tx) => sum + (tx.amount || 0),
//         0,
//       ),
//       totalCharges: loanTransactions.reduce(
//         (sum, tx) => sum + (tx.charge || 0),
//         0,
//       ),
//       totalTransactions: loanTransactions.length,
//       averageLoanSize:
//         loanTransactions.length > 0
//           ? loanTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) /
//             loanTransactions.length
//           : 0,
//     };
//     summary.totalProfit = summary.totalCharges; // Assuming charges represent profit

//     // 2. Get farmers who have loan transactions
//     const farmersWithLoans = await Transaction.aggregate([
//       {
//         $match: {
//           type: 'loan',
//           createdAt: { $gte: startDate, $lte: endDate },
//           status: 'completed',
//         },
//       },
//       {
//         $group: {
//           _id: '$farmer',
//         },
//       },
//     ]);

//     if (farmersWithLoans.length === 0) {
//       throw new Error('No loan transactions found in the specified date range');
//     }

//     const farmerIds = farmersWithLoans.map((f) => f._id);

//     // 3. Get all necessary data in optimized queries
//     const [farmers, kilosAggregation, wallets] = await Promise.all([
//       Farmer.find({ _id: { $in: farmerIds } })
//         .select('name idNumber phoneNumber farmerCode')
//         .lean(),

//       Kilo.aggregate([
//         {
//           $match: {
//             farmer: { $in: farmerIds },
//             createdAt: { $gte: startDate, $lte: endDate },
//           },
//         },
//         {
//           $group: {
//             _id: '$farmer',
//             totalKgs: { $sum: '$netUnits' },
//           },
//         },
//       ]),

//       Wallet.find({ farmer: { $in: farmerIds } })
//         .select('farmer loanLimit borrowedAmount payableAmount')
//         .lean(),
//     ]);

//     // Create lookup maps
//     const farmerMap = farmers.reduce((acc, farmer) => {
//       acc[farmer._id] = farmer;
//       return acc;
//     }, {});

//     const kgsMap = kilosAggregation.reduce((acc, item) => {
//       acc[item._id] = item.totalKgs;
//       return acc;
//     }, {});

//     const walletMap = wallets.reduce((acc, wallet) => {
//       acc[wallet.farmer] = wallet;
//       return acc;
//     }, {});

//     // 4. Prepare the final dataset
//     const rows = farmerIds
//       .map((farmerId) => {
//         const farmer = farmerMap[farmerId];
//         const wallet = walletMap[farmerId];
//         const kgsLoaded = kgsMap[farmerId] || 0;

//         if (!farmer || !wallet) {
//           console.warn(`Missing data for farmer ${farmerId}`);
//           return null;
//         }

//         const availableLimit = Math.max(
//           0,
//           (wallet.loanLimit || 0) - (wallet.borrowedAmount || 0),
//         );

//         return {
//           name: farmer.name,
//           idNumber: farmer.idNumber,
//           phoneNumber: farmer.phoneNumber,
//           farmerCode: farmer.farmerCode,
//           kgsLoaded: kgsLoaded,
//           limit: wallet.loanLimit || 0,
//           borrowed: wallet.borrowedAmount || 0,
//           availableLimit: availableLimit,
//           payableAmount: wallet.payableAmount || 0,
//           utilizationRate: wallet.loanLimit
//             ? ((wallet.borrowedAmount / wallet.loanLimit) * 100).toFixed(2) +
//               '%'
//             : '0%',
//         };
//       })
//       .filter((row) => row !== null);

//     if (rows.length === 0) {
//       throw new Error('No complete data records found after processing');
//     }

//     // 5. Generate CSV with summary
//     const fields = [
//       'name',
//       'idNumber',
//       'phoneNumber',
//       'farmerCode',
//       'kgsLoaded',
//       'limit',
//       'borrowed',
//       'availableLimit',
//       'payableAmount',
//       'utilizationRate',
//     ];

//     const json2csvParser = new Parser({ fields });
//     let csv = json2csvParser.parse(rows);

//     // Add summary section
//     csv += `\n\nSUMMARY STATISTICS\n`;
//     csv += `Total Borrowed Amount,${summary.totalBorrowed.toFixed(2)}\n`;
//     csv += `Total Profit (Charges),${summary.totalProfit.toFixed(2)}\n`;
//     csv += `Total Loan Transactions,${summary.totalTransactions}\n`;
//     csv += `Average Loan Size,${summary.averageLoanSize.toFixed(2)}\n`;

//     // 6. Save to file
//     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//     const reportsDir = path.join(__dirname, 'reports');

//     if (!fs.existsSync(reportsDir)) {
//       fs.mkdirSync(reportsDir);
//     }

//     const filename = path.join(
//       reportsDir,
//       `farmer_loans_report_with_summary_${timestamp}.csv`,
//     );
//     fs.writeFileSync(filename, csv);

//     console.log('\nREPORT SUMMARY:');
//     console.log('---------------');
//     console.log(`Total Borrowed: ${summary.totalBorrowed.toFixed(2)}`);
//     console.log(`Total Profit: ${summary.totalProfit.toFixed(2)}`);
//     console.log(`Transactions: ${summary.totalTransactions}`);
//     console.log(`Average Loan: ${summary.averageLoanSize.toFixed(2)}`);
//     console.log(`\nSuccessfully generated report with ${rows.length} records`);
//     console.log(`Saved to: ${filename}`);

//     return { filename, summary };
//   } catch (error) {
//     console.error('\nError generating report:', error.message);
//     throw error;
//   }
// };

// Execute
(async () => {
  try {
    const { filename, summary } = await generateCSV();
    // You can use the summary data for other purposes if needed
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
})();
