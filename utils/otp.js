// Generate a 5-digit OTP
function generateOTP() {
  const digits = '0123456789';

  const OTP = Array.from(
    { length: 5 },
    () => digits[Math.floor(Math.random() * 10)],
  ).join('');

  return OTP;
}

module.exports = generateOTP;
