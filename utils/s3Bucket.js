const AWS = require('aws-sdk');

// Setup your S3 bucket here
const s3BucketEndpoint = new AWS.Endpoint(process.env.S3_BUCKET_ENDPOINT);
const s3 = new AWS.S3({
  endpoint: s3BucketEndpoint,
  accessKeyId: process.env.S3_BUCKET_KEY,
  secretAccessKey: process.env.S3_BUCKET_SECRET,
});

module.exports = s3;
