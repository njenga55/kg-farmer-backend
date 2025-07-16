const axios = require('axios');

// C2B Transactions
class MpesaC2bAPI {
  constructor(consumerKey, consumerSecret) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.accessToken = '';
  }

  // Generate access token
  async generateAccessToken() {
    const auth = Buffer.from(
      `${this.consumerKey}:${this.consumerSecret}`,
    ).toString('base64');
    const url = process.env.OAUTH_URL;
    const headers = {
      Authorization: `Basic ${auth}`,
    };

    const response = await axios.get(url, { headers });
    this.accessToken = response.data.access_token;
    return this.accessToken;
  }

  // Initiate a C2B STK push transaction
  async initiatePayment(amount, phone, callbackUrl) {
    const token = await this.generateAccessToken();
    const url = process.env.STK_PUSH_URL;
    const authHeaderToken = `Bearer ${token}`;
    const headers = {
      Authorization: authHeaderToken,
      'Content-Type': 'application/json',
    };
    const shortCode = process.env.MPESA_SHORT_CODE;
    const passKey = process.env.C2B_PASS_KEY;
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, -3);

    const body = {
      BusinessShortCode: shortCode,
      Password: Buffer.from(`${shortCode}${passKey}${timestamp}`).toString(
        'base64',
      ),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: 'Pharmacy A',
      TransactionDesc: 'Deposit to flexi fund!',
    };

    const response = await axios.post(url, body, { headers });
    return response.data;
  }

  // Check balance
  async checkBalance() {
    const token = await this.generateAccessToken();
    const url = process.env.ACCOUNT_BAL_URL;
    const authHeaderToken = `Bearer ${token}`;
    const headers = {
      Authorization: authHeaderToken,
      'Content-Type': 'application/json',
    };
    const body = {
      Initiator: process.env.MPESA_INITIATOR,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIALS,
      CommandID: 'AccountBalance',
      PartyA: process.env.MPESA_SHORT_CODE,
      IdentifierType: '4',
      Remarks: 'bal',
      QueueTimeOutURL: process.env.C2B_TIME_OUT_URL,
      ResultURL: process.env.C2B_RESULT_BAL_URL,
    };

    const response = await axios.post(url, body, { headers });
    return response.data;
  }
}

module.exports = MpesaC2bAPI;
