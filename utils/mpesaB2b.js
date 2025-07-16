const axios = require('axios');

// B2B Transactions
class MpesaB2bAPI {
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
  async initiateTransaction(amount, shortCode, callbackUrl) {
    const token = await this.generateToken();
    const url = process.env.B2B_REQUEST_URL;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const body = {
      Initiator: process.env.MPESA_INITIATOR,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIALS,
      CommandID: 'BusinessPayBill',
      SenderIdentifierType: '4',
      RecieverIdentifierType: '4',
      Amount: amount,
      PartyA: process.env.MPESA_SHORT_CODE,
      PartyB: shortCode,
      AccountReference: '353353',
      Remarks: 'Request b2c payment',
      QueueTimeOutURL: process.env.B2C_TIME_OUT_URL,
      ResultURL: callbackUrl,
    };

    const response = await axios.post(url, body, { headers });
    return response.data;
  }
}

module.exports = MpesaB2bAPI;
