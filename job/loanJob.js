const cron = require('node-cron');
const axios = require('axios');
const moment = require('moment-timezone');
const Farmer = require('../models/farmerModel'); 
const Kilo = require('../models/kiloModel'); 
cron.schedule(
  '* * * * *',
  async () => {
    console.log(`Running  reset at ${moment()}`);
    const farmers = await Farmer.find({ canBorrow: true });
    for (const farmer of farmers) {
      const kilos = await Kilo.find({
        farmer: farmer._id,
        // createdAt: { $gte: today, $lt: tomorrow }
      });
      const totalUnits = kilos.reduce((sum, k) => sum + k.netUnits, 0);
      const totalGrossPay = kilos.reduce((sum, k) => sum + k.grossPay, 0);
      const totalPayableAmount = kilos.reduce((sum, k) => sum + k.netUnits, 0);
      const loanLimit = totalGrossPay * 0.5; // Assuming 50% of gross pay is the loan limit
      console.log(
        '--------------------------------------------------------------------',
      );
      console.log(`Farmer: ${farmer.name}`);
      console.log(`Total units ${totalUnits} units of produce`);
      console.log(`Total gross pay: ${totalGrossPay}`);
      console.log(`Total payable amount: ${totalPayableAmount}`);
      console.log(`Loan limit  ${loanLimit}`);
    }
  },
  {
    scheduled: true,
    timezone: 'Africa/Nairobi',
  },
);
