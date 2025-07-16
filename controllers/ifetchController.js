// ============== ifetchController.js ==============
const axios = require('axios');
const mongoose = require('mongoose');
const Kilo = require('./../models/kiloModel');
const Wallet = require('./../models/walletModel');

// JWT Login and Token Management
let jwtToken;
let tokenExpiry;

// Retry handler with exponential backoff
const withRetry = async (
  fn,
  context = 'operation',
  maxRetries = 3,
  baseDelay = 1000,
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.errorLabels?.includes('TransientTransactionError')) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `🔄 MongoDB transient error in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (error.response?.status === 503) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `🔄 503 encountered in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

const login = async () => {
  const response = await withRetry(() =>
    axios.post(
      'https://ifetch.tetteafactory.com:9443/api/account/login',
      {
        username: 'isaac-crystalgate',
        password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
      },
      { timeout: 10000 },
    ),
  );

  jwtToken = response.data.token;
  tokenExpiry = new Date(response.data.expiresat).getTime();
};

const getToken = async () => {
  if (!jwtToken || Date.now() >= tokenExpiry) {
    await login();
  }
  return jwtToken;
};

const getFarmerFromIfetch = async (phone) => {
  try {
    const token = await getToken();

    return await withRetry(async () => {
      const farmer = await axios.post(
        'https://ifetch.tetteafactory.com:9443/api/farmer/queryfarmers',
        { skip: 0, take: 10,
          //  phoneNumber: phone 
          },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        },
      );
      return farmer.data.farmers;
    });
  } catch (error) {
    console.error('⚠️ Error fetching farmer:', error.message);
    return null;
  }
};

const getEATISOString = (date = new Date()) => {
  const eatOffsetMs = 3 * 60 * 60 * 1000;
  const eatDate = new Date(date.getTime() + eatOffsetMs);
  return eatDate.toISOString().replace('Z', '+03:00');
};

const fetchAndSaveKilosInBatches = async (
  farmerCode,
  farmerId,
  dbKiloCount,
) => {
  try {
    const token = await getToken();
    const batchSize = 100;
    let skip = dbKiloCount;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = getEATISOString(startOfMonth);
    const monthEnd = getEATISOString(now);

    const initialResponse = await withRetry(async () => {
      return axios.post(
        'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
        {
          skip: 0,
          take: 1,
          trxStart: monthStart,
          trxEnd: monthEnd,
          farmerCode,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 20000,
        },
      );
    }, 'initial-count');

    console.log(`Initial count request for farmer ${farmerCode} returned:`, initialResponse.data);

    const totalKilosRecords = initialResponse.data.count;
    console.log(`Total kilos records to process: ${totalKilosRecords}`);
    
    if (totalKilosRecords <= dbKiloCount) {
      console.log('✅ No new records to fetch');
      return;
    }

    while (skip < totalKilosRecords) {
      await withRetry(async () => {
        try {
          const response = await axios.post(
            'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
            {
              skip,
              take: batchSize,
              trxStart: monthStart,
              trxEnd: monthEnd,
              farmerCode,
            },
            {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 30000,
            },
          );

          const { transactions } = response.data;
          const bulkOps = [];

          for (const transaction of transactions) {
            bulkOps.push({
              updateOne: {
                filter: { recordID: transaction.recordID },
                update: {
                  $setOnInsert: {
                    recordID: transaction.recordID,
                    farmer: farmerId,
                    transTime: new Date(transaction.transTime).toISOString(),
                    farmerCode,
                    idNumber: transaction.idNumber,
                    transCode: transaction.transCode,
                    routeCode: transaction.routeCode,
                    routeName: transaction.routeName,
                    centreCode: transaction.centreCode,
                    centreName: transaction.centreName,
                    netUnits: transaction.netUnits,
                    paymentRate: transaction.paymentRate,
                    grossPay: transaction.grossPay,
                    transportCost: transaction.transportCost,
                    transportRecovery: transaction.transportRecovery,
                  },
                },
                upsert: true,
              },
            });
          }

          if (bulkOps.length > 0) {
            // Execute bulk operations without session
            await Kilo.bulkWrite(bulkOps);

            // Update Wallet for each transaction
            for (const transaction of transactions) {
              const weight = parseFloat(transaction.netUnits.toFixed(2));
              const earningsAmount = parseFloat(
                transaction.grossPay.toFixed(2),
              );
              const loanLimit = parseFloat(
                (transaction.grossPay / 2).toFixed(2),
              );
              const payableAmount = parseFloat(transaction.grossPay.toFixed(2));

              await Wallet.updateOne(
                { farmer: farmerId },
                {
                  $inc: {
                    weight,
                    earningsAmount,
                    loanLimit,
                    payableAmount,
                  },
                }
              );
            }
          }

          console.log(`✅ Saved batch ${skip}-${skip + batchSize}`);
        } catch (err) {
          throw err;
        }
      }, `batch-${skip}`);

      skip += batchSize;
    }

    console.log('✨ All records processed');
  } catch (err) {
    if (err.response?.status === 503) {
      console.warn('⏸️ 503 encountered - pausing API operations');
    } else if (err.errorLabels?.includes('TransientTransactionError')) {
      console.warn('🔄 MongoDB transient error - retrying operation');
    } else {
      console.error('⚠️ Critical error in batch processing:', err);
    }
  }
};

module.exports = {
  getFarmerFromIfetch,
  fetchAndSaveKilosInBatches,
};

// // ============== ifetchController.js ==============
// const axios = require('axios');
// const mongoose = require('mongoose');
// const Kilo = require('./../models/kiloModel');

// // JWT Login and Token Management
// let jwtToken;
// let tokenExpiry;

// // Retry handler with exponential backoff
// // Enhanced retry handler
// const withRetry = async (
//   fn,
//   context = 'operation',
//   maxRetries = 3,
//   baseDelay = 1000,
// ) => {
//   for (let attempt = 1; attempt <= maxRetries; attempt++) {
//     try {
//       return await fn();
//     } catch (error) {
//       // Handle MongoDB transient errors
//       if (error.errorLabels?.includes('TransientTransactionError')) {
//         if (attempt === maxRetries) throw error;

//         const delay = baseDelay * Math.pow(2, attempt - 1);
//         console.warn(
//           `🔄 MongoDB transient error in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
//         );
//         await new Promise((resolve) => setTimeout(resolve, delay));
//       }
//       // Handle 503 errors
//       else if (error.response?.status === 503) {
//         if (attempt === maxRetries) throw error;

//         const delay = baseDelay * Math.pow(2, attempt - 1);
//         console.warn(
//           `🔄 503 encountered in ${context}. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
//         );
//         await new Promise((resolve) => setTimeout(resolve, delay));
//       } else {
//         throw error;
//       }
//     }
//   }
// };
// // const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
// //   for (let attempt = 1; attempt <= maxRetries; attempt++) {
// //     try {
// //       return await fn();
// //     } catch (error) {
// //       // Handle 503 specifically
// //       if (error.response?.status === 503) {
// //         if (attempt === maxRetries) throw error;

// //         const delay = baseDelay * Math.pow(2, attempt - 1);
// //         console.warn(
// //           `🔄 503 encountered. Retrying (${attempt}/${maxRetries}) in ${delay}ms`,
// //         );
// //         await new Promise((resolve) => setTimeout(resolve, delay));
// //       } else {
// //         throw error;
// //       }
// //     }
// //   }
// // };

// const login = async () => {
//   const response = await withRetry(() =>
//     axios.post(
//       'https://ifetch.tetteafactory.com:9443/api/account/login',
//       {
//         username: 'isaac-crystalgate',
//         password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
//       },
//       { timeout: 10000 }, // Add timeout protection
//     ),
//   );

//   jwtToken = response.data.token;
//   tokenExpiry = new Date(response.data.expiresat).getTime();
// };

// // Middleware to refresh token if expired (unchanged)
// const getToken = async () => {
//   if (!jwtToken || Date.now() >= tokenExpiry) {
//     await login();
//   }
//   return jwtToken;
// };

// const getFarmerFromIfetch = async (phone) => {
//   try {
//     const token = await getToken();

//     return await withRetry(async () => {
//       const farmer = await axios.post(
//         'https://ifetch.tetteafactory.com:9443/api/farmer/queryfarmers',
//         { skip: 0, take: 1, phoneNumber: phone },
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           timeout: 15000,
//         },
//       );
//       return farmer.data.farmers;
//     });
//   } catch (error) {
//     console.error('⚠️ Error fetching farmer:', error.message);
//     return null; // Fail gracefully
//   }
// };

// const getEATISOString = (date = new Date()) => {
//   const eatOffsetMs = 3 * 60 * 60 * 1000;
//   const eatDate = new Date(date.getTime() + eatOffsetMs);
//   return eatDate.toISOString().replace('Z', '+03:00');
// };

// // Helper function to fetch and save farmer kilos in batches
// // Batch processing with enhanced transaction safety
// const fetchAndSaveKilosInBatches = async (
//   farmerCode,
//   farmerId,
//   dbKiloCount,
// ) => {
//   try {
//     const token = await getToken();
//     const batchSize = 100;
//     let skip = dbKiloCount;
//     const now = new Date();
//     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     const monthStart = getEATISOString(startOfMonth);
//     const monthEnd = getEATISOString(now);

//     // Initial count request
//     const initialResponse = await withRetry(async () => {
//       return axios.post(
//         'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
//         {
//           skip: 0,
//           take: 1,
//           trxStart: monthStart,
//           trxEnd: monthEnd,
//           farmerCode,
//         },
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           timeout: 20000,
//         },
//       );
//     }, 'initial-count');

//     const totalKilosRecords = initialResponse.data.count;
//     if (totalKilosRecords <= dbKiloCount) {
//       console.log('✅ No new records to fetch');
//       return;
//     }

//     while (skip < totalKilosRecords) {
//       await withRetry(async () => {
//         const session = await mongoose.startSession();
//         session.startTransaction();

//         try {
//           const response = await axios.post(
//             'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
//             {
//               skip,
//               take: batchSize,
//               trxStart: monthStart,
//               trxEnd: monthEnd,
//               farmerCode,
//             },
//             {
//               headers: { Authorization: `Bearer ${token}` },
//               timeout: 30000,
//             },
//           );

//           const { transactions } = response.data;
//           const bulkOps = [];

//           for (const transaction of transactions) {
//             bulkOps.push({
//               updateOne: {
//                 filter: { recordID: transaction.recordID },
//                 update: {
//                   $setOnInsert: {
//                     recordID: transaction.recordID,
//                     farmer: farmerId,
//                     transTime: new Date(transaction.transTime).toISOString(),
//                     farmerCode,
//                     idNumber: transaction.idNumber,
//                     transCode: transaction.transCode,
//                     routeCode: transaction.routeCode,
//                     routeName: transaction.routeName,
//                     centreCode: transaction.centreCode,
//                     centreName: transaction.centreName,
//                     netUnits: transaction.netUnits,
//                     paymentRate: transaction.paymentRate,
//                     grossPay: transaction.grossPay,
//                     transportCost: transaction.transportCost,
//                     transportRecovery: transaction.transportRecovery,
//                   },
//                 },
//                 upsert: true,
//               },
//             });
//           }

//           if (bulkOps.length > 0) {
//             await Kilo.bulkWrite(bulkOps, { session });
//           }

//           await session.commitTransaction();
//           console.log(`✅ Saved batch ${skip}-${skip + batchSize}`);
//         } catch (err) {
//           await session.abortTransaction();
//           throw err;
//         } finally {
//           session.endSession();
//         }
//       }, `batch-${skip}`);

//       skip += batchSize;
//     }

//     console.log('✨ All records processed');
//   } catch (err) {
//     if (err.response?.status === 503) {
//       console.warn('⏸️ 503 encountered - pausing API operations');
//     } else if (err.errorLabels?.includes('TransientTransactionError')) {
//       console.warn('🔄 MongoDB transient error - retrying operation');
//     } else {
//       console.error('⚠️ Critical error in batch processing:', err);
//     }
//   }
// };

// // Export unchanged
// module.exports = {
//   getFarmerFromIfetch,
//   fetchAndSaveKilosInBatches,
// };

// const axios = require('axios');
// const mongoose = require('mongoose');
// const Kilo = require('./../models/kiloModel');

// // JWT Login and Token Management
// let jwtToken;
// let tokenExpiry;

// const login = async () => {
//   const response = await axios.post(
//     'https://ifetch.tetteafactory.com:9443/api/account/login',
//     {
//       username: 'isaac-crystalgate',
//       password: 'tz6Y,VFP_o]dkyxj1r&wvZ2{46xX&W@9',
//     },
//   );

//   jwtToken = response.data.token;
//   tokenExpiry = new Date(response.data.expiresat).getTime(); // Parse expiration time
// };

// // Middleware to refresh token if expired
// const getToken = async () => {
//   if (!jwtToken || Date.now() >= tokenExpiry) {
//     await login();
//   }
//   return jwtToken;
// };

// const getFarmerFromIfetch = async (phone) => {
//   try {
//     const token = await getToken();

//     // Initial request to get a farmer
//     const farmer = await axios.post(
//       'https://ifetch.tetteafactory.com:9443/api/farmer/queryfarmers',
//       { skip: 0, take: 1, phoneNumber: phone },
//       { headers: { Authorization: `Bearer ${token}` } },
//     );
//     return farmer.data.farmers;
//   } catch (error) {
//     console.log('Error fetching a farmer', error);
//   }
// };

// const getEATISOString = (date = new Date()) => {
//   const eatOffsetMs = 3 * 60 * 60 * 1000;
//   const eatDate = new Date(date.getTime() + eatOffsetMs);
//   return eatDate.toISOString().replace('Z', '+03:00');
// };

// // Helper function to fetch and save farmer kilos in batches
// const fetchAndSaveKilosInBatches = async (
//   farmerCode,
//   farmerId,
//   dbKiloCount,
// ) => {
//   const token = await getToken();
//   const batchSize = 100;
//   let skip = dbKiloCount;
//   const now = new Date();
//   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//   const monthStart = getEATISOString(startOfMonth);
//   const monthEnd = getEATISOString(now);

//   try {
//     const initialResponse = await axios.post(
//       'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
//       {
//         skip: 0,
//         take: 1,
//         trxStart: monthStart,
//         trxEnd: monthEnd,
//         farmerCode,
//       },
//       { headers: { Authorization: `Bearer ${token}` } },
//     );

//     const totalKilosRecords = initialResponse.data.count;
//     if (totalKilosRecords <= dbKiloCount) {
//       console.log('No new records to fetch.');
//       return;
//     }

//     while (skip < totalKilosRecords) {
//       const session = await mongoose.startSession();
//       session.startTransaction();

//       try {
//         const response = await axios.post(
//           'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
//           {
//             skip,
//             take: batchSize,
//             trxStart: monthStart,
//             trxEnd: monthEnd,
//             farmerCode,
//           },
//           { headers: { Authorization: `Bearer ${token}` } },
//         );

//         const { transactions } = response.data;

//         for (const transaction of transactions) {
//           const exists = await Kilo.exists({ recordID: transaction.recordID });
//           if (!exists) {
//             await Kilo.create(
//               [
//                 {
//                   recordID: transaction.recordID,
//                   farmer: farmerId,
//                   transTime: new Date(transaction.transTime).toISOString(),
//                   farmerCode,
//                   idNumber: transaction.idNumber,
//                   transCode: transaction.transCode,
//                   routeCode: transaction.routeCode,
//                   routeName: transaction.routeName,
//                   centreCode: transaction.centreCode,
//                   centreName: transaction.centreName,
//                   netUnits: transaction.netUnits,
//                   paymentRate: transaction.paymentRate,
//                   grossPay: transaction.grossPay,
//                   transportCost: transaction.transportCost,
//                   transportRecovery: transaction.transportRecovery,
//                 },
//               ],
//               { session },
//             );
//           }
//         }

//         await session.commitTransaction();
//         session.endSession();

//         console.log(
//           `✅ Fetched and saved records from ${skip} to ${skip + batchSize}`,
//         );
//         skip += batchSize;
//       } catch (err) {
//         await session.abortTransaction();
//         session.endSession();

//         // Gracefully handle 503
//         if (err.response?.status === 503) {
//           console.error('⚠️ Service unavailable (503). Skipping batch...');
//           return; // Exit early
//         }

//         console.error('❌ Transaction failed:', err);
//         throw err; // Stop loop for other errors
//       }
//     }

//     console.log('✅ All new records have been fetched and saved.');
//   } catch (err) {
//     // Handle 503 from the initial count request
//     if (err.response?.status === 503) {
//       console.error('⚠️ Initial API call failed with 503. Aborting fetch.');
//       return;
//     }

//     console.error('❌ Failed to initialize fetch:', err);
//     throw err;
//   }
// };

// // const fetchAndSaveKilosInBatches = async (
// //   farmerCode,
// //   farmerId,
// //   dbKiloCount,
// // ) => {
// //   const token = await getToken();
// //   const batchSize = 100;
// //   let skip = dbKiloCount;
// //   const now = new Date();
// //   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
// //   const monthStart = getEATISOString(startOfMonth);
// //   const monthEnd = getEATISOString(now);

// //   const initialResponse = await axios.post(
// //     'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
// //     {
// //       skip: 0,
// //       take: 1,
// //       trxStart: monthStart,
// //       trxEnd: monthEnd,
// //       farmerCode,
// //     },
// //     { headers: { Authorization: `Bearer ${token}` } },
// //   );

// //   const totalKilosRecords = initialResponse.data.count;
// //   if (totalKilosRecords <= dbKiloCount) {
// //     console.log('No new records to fetch.');
// //     return;
// //   }

// //   while (skip < totalKilosRecords) {
// //     const session = await mongoose.startSession();
// //     session.startTransaction();

// //     try {
// //       const response = await axios.post(
// //         'https://ifetch.tetteafactory.com:9443/api/transaction/querytransactions',
// //         {
// //           skip,
// //           take: batchSize,
// //           trxStart: monthStart,
// //           trxEnd: monthEnd,
// //           farmerCode,
// //         },
// //         { headers: { Authorization: `Bearer ${token}` } },
// //       );

// //       const { transactions } = response.data;

// //       for (const transaction of transactions) {
// //         const exists = await Kilo.exists({ recordID: transaction.recordID });
// //         if (!exists) {
// //           await Kilo.create(
// //             [
// //               {
// //                 recordID: transaction.recordID,
// //                 farmer: farmerId,
// //                 transTime: new Date(transaction.transTime).toISOString(),
// //                 farmerCode,
// //                 idNumber: transaction.idNumber,
// //                 transCode: transaction.transCode,
// //                 routeCode: transaction.routeCode,
// //                 routeName: transaction.routeName,
// //                 centreCode: transaction.centreCode,
// //                 centreName: transaction.centreName,
// //                 netUnits: transaction.netUnits,
// //                 paymentRate: transaction.paymentRate,
// //                 grossPay: transaction.grossPay,
// //                 transportCost: transaction.transportCost,
// //                 transportRecovery: transaction.transportRecovery,
// //               },
// //             ],
// //             { session },
// //           );
// //         }
// //       }

// //       await session.commitTransaction();
// //       session.endSession();

// //       console.log(
// //         `Fetched and saved records from ${skip} to ${skip + batchSize}`,
// //       );
// //       skip += batchSize;
// //     } catch (err) {
// //       console.error('Transaction failed, rolling back:', err);
// //       await session.abortTransaction();
// //       session.endSession();
// //       throw err; // Stop the loop if something fails
// //     }
// //   }

// //   console.log('All new records have been fetched and saved.');
// // };

// module.exports = {
//   getFarmerFromIfetch,
//   fetchAndSaveKilosInBatches,
// };
