/**
 * Quick Storable Edge OAuth 1.0a smoke test (one-legged).
 *
 * Usage (PowerShell):
 *   $env:STOREDGE_KEY="your_consumer_key"
 *   $env:STOREDGE_SECRET="your_consumer_secret"
 *   $env:STOREDGE_FACILITY="facility-uuid"
 *   node test-storedge.js
 *
 * Do not commit real credentials.
 */
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const https = require('https');

const consumerKey = process.env.STOREDGE_KEY || '';
const consumerSecret = process.env.STOREDGE_SECRET || '';
const facilityId = process.env.STOREDGE_FACILITY || '';
const baseUrl = (process.env.STOREDGE_BASE_URL || 'https://api.storedgefms.com').replace(/\/+$/, '');

if (!consumerKey || !consumerSecret || !facilityId) {
  console.error('Set STOREDGE_KEY, STOREDGE_SECRET, STOREDGE_FACILITY (and optionally STOREDGE_BASE_URL).');
  process.exit(1);
}

const oauth = new OAuth({
  consumer: { key: consumerKey, secret: consumerSecret },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  },
});

function requestPath(endpoint) {
  return `/v1/${facilityId}/${endpoint}`;
}

async function testEndpoint(endpoint, description) {
  const fullUrl = `${baseUrl}${requestPath(endpoint)}`;
  console.log(`\n=== ${description} ===\nGET ${fullUrl}`);

  const requestData = { url: fullUrl, method: 'GET' };
  const authHeaders = oauth.toHeader(oauth.authorize(requestData));

  return new Promise((resolve) => {
    const u = new URL(fullUrl);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          if (parsed.meta) {
            console.log('meta:', JSON.stringify(parsed.meta, null, 2));
          } else {
            console.log('body (truncated):', data.slice(0, 400));
          }
        } catch {
          console.log('Raw (truncated):', data.slice(0, 400));
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(e.message);
      resolve();
    });
    req.end();
  });
}

(async () => {
  console.log('Storable Edge smoke test');
  await testEndpoint('units', 'Units');
  await testEndpoint('tenants/current', 'Tenants (current)');
})();
