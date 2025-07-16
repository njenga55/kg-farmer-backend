const axios = require('axios');

// B2C Transactions
class MpesaB2cAPI {
  constructor(consumerKey, consumerSecret) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.accessToken = '';
  }

  // Generate access token
  async generateToken() {
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

  // Initiate a B2C transaction
  async initiateTransaction(amount, phone,occassionId, callbackUrl) {
    const token = await this.generateToken();
    const url = process.env.B2C_REQUEST_URL;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const body = {
      InitiatorName: process.env.MPESA_INITIATOR,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIALS,
      CommandID: 'BusinessPayment',
      Amount: amount,
      PartyA: process.env.MPESA_SHORT_CODE,
      PartyB: phone,
      Remarks: 'Request b2c payment',
      QueueTimeOutURL: process.env.B2C_TIME_OUT_URL,
      ResultURL: callbackUrl,
      TransactionDesc: 'Withdraw from',
      Occassion:occassionId, // Optional field for additional info
    };

    const response = await axios.post(url, body, { headers });
    return response.data;
  }

  // Check B2C paybill balance
  async checkBalance() {
    const token = await this.generateToken();
    const url = process.env.ACCOUNT_BAL_URL;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const body = {
      Initiator: process.env.MPESA_INITIATOR,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIALS,
      CommandID: 'AccountBalance',
      PartyA: process.env.MPESA_SHORT_CODE,
      IdentifierType: '4',
      Remarks: 'bal',
      QueueTimeOutURL: process.env.B2C_TIME_OUT_URL,
      ResultURL: process.env.B2C_RESULT_BAL_URL,
    };

    const response = await axios.post(url, body, { headers });
    return response.data;
  }
}

module.exports = MpesaB2cAPI;
