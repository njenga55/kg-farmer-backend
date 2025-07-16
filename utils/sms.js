const request = require('request');

class SmsSender {
  constructor(smsBaseUrl, apiKey) {
    this.apiUrl = smsBaseUrl;
    this.apiKey = apiKey;
  }

  // Make request
  _makeRequest(url, method, headers, formData) {
    return new Promise((resolve, reject) => {
      const options = {
        method: method,
        url: url,
        headers: headers,
        formData: formData, // Ensure formData is correctly passed here
      };

      request(options, (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
    });
  }

  // Send SMS
  async sendSms(options) {
    const headers = {
      apiKey: this.apiKey,
    };

    const formData = {
      username: process.env.SMS_USERNAME,
      to: options.to,
      message: options.message,
      from: process.env.SMS_SENDER_ID,
      enqueue: '1',
    };

    // eslint-disable-next-line no-useless-catch
    try {
      const response = await this._makeRequest(
        this.apiUrl,
        'POST',
        headers,
        formData,
      );
      return response;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SmsSender;
