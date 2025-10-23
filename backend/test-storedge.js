const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

// Storable Edge credentials from user
const consumerKey = 'G47RvX9KXMApR6MJ096T43otz6NC7gUXnF4LMBPv';
const consumerSecret = 'B2IyvJ53vW160sk8TphzGUujkNrFK7iE1I96Tl3k';
// The facility ID from the user's setup
const facilityId = 'eb45f0b3-2caf-4fdf-93fd-ba4975bb5352';
const baseUrl = 'https://api.storedgefms.com';

console.log('Testing Storable Edge API connection...');

const testEndpoint = async (endpoint, description) => {
  console.log(`\n=== Testing ${description} ===`);
  console.log('URL:', `${baseUrl}/v1/${facilityId}/${endpoint}`);

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
    url: `${baseUrl}/v1/${facilityId}/${endpoint}`,
    method: 'GET',
  };

  const headers = oauth.toHeader(oauth.authorize(requestData));
  console.log('OAuth Headers:', JSON.stringify(headers, null, 2));

  return new Promise((resolve) => {
    const https = require('https');
    const options = {
      hostname: 'api.storedgefms.com',
      path: `/v1/${facilityId}/${endpoint}`,
      method: 'GET',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (endpoint === 'tenants/current') {
            console.log('Response has', parsed.tenants ? parsed.tenants.length : 'unknown', 'tenants');
            if (parsed.tenants && parsed.tenants.length > 0) {
              console.log('\nFirst 3 tenants:');
              parsed.tenants.slice(0, 3).forEach((tenant, index) => {
                console.log(`Tenant ${index + 1}:`, {
                  id: tenant.id,
                  email: tenant.email,
                  first_name: tenant.first_name,
                  last_name: tenant.last_name,
                  active: tenant.active
                });
              });

              // Check for null emails
              const nullEmails = parsed.tenants.filter(t => t.email === null || t.email === undefined);
              console.log(`\nTenants with null/undefined emails: ${nullEmails.length}`);
              if (nullEmails.length > 0) {
                console.log('Null email tenant IDs:', nullEmails.map(t => t.id));
              }
            }
          } else {
            console.log('Units response received (not showing full data)');
          }
          resolve(parsed);
        } catch (e) {
          console.log('Raw response:', data.substring(0, 200));
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      resolve(null);
    });

    req.end();
  });
};

// Test both endpoints
(async () => {
  await testEndpoint('units', 'Units Endpoint');
  await testEndpoint('tenants/current', 'Tenants Endpoint');
})();
