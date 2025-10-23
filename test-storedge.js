const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

// Storable Edge credentials from user
const consumerKey = 'G47RvX9KXMApR6MJ096T43otz6NC7gUXnF4LMBPv';
const consumerSecret = 'B2IyvJ53vW160sk8TphzGUujkNrFK7iE1I96Tl3k';
const facilityId = 'eb45f0b3-2caf-4fdf-93fd-ba4975bb5352';
const baseUrl = 'https://api.storedgefms.com';

const url = `${baseUrl}/v1/${facilityId}/units`;

console.log('Testing Storable Edge API connection...');
console.log('URL:', url);
console.log('Consumer Key:', consumerKey);
console.log('Consumer Secret:', consumerSecret.substring(0, 10) + '...');

const oauth = new OAuth({
  consumer: {
    key: consumerKey,
    secret: consumerSecret,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto
      .createHmac('sha1', key)
      .update(base_string)
      .digest('base64');
  },
});

const requestData = {
  url: url,
  method: 'GET',
};

const headers = oauth.toHeader(oauth.authorize(requestData));
console.log('\nOAuth Headers:');
console.log(JSON.stringify(headers, null, 2));

// Now make the actual request
const https = require('https');

const options = {
  hostname: 'api.storedgefms.com',
  path: `/v1/${facilityId}/units`,
  method: 'GET',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};

console.log('\nMaking request...');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
