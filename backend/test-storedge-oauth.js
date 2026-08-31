/**
 * Quick test script to verify Storedge API OAuth 1.0a authentication
 * Run with: node test-storedge-oauth.js
 */

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

// Configuration - test BOTH with and without dashes
const configWithDashes = {
  baseUrl: 'https://api.storedgefms.com',
  facilityId: '26ab987b-defe-4138-aad7-cf4456b03437',
  consumerKey: 'bAa19ipBVXJokyMjhiwzkWncfF6wzdDA2dMH9tP7',
  consumerSecret: 'crem52E3OKeqqsHKNKzb53pZFnoxvaeOr7xARjrh',
};

const configWithoutDashes = {
  baseUrl: 'https://api.storedgefms.com',
  facilityId: '26ab987bdefe4138aad7cf4456b03437',
  consumerKey: 'bAa19ipBVXJokyMjhiwzkWncfF6wzdDA2dMH9tP7',
  consumerSecret: 'crem52E3OKeqqsHKNKzb53pZFnoxvaeOr7xARjrh',
};

let config = configWithDashes; // Start with dashes

/**
 * Generate OAuth 1.0a signature
 */
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
  // Sort parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Create signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64');

  return signature;
}

/**
 * Generate OAuth 1.0a authorization header
 */
function generateOAuthHeader(method, url, consumerKey, consumerSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };

  // Generate signature
  const signature = generateOAuthSignature(method, url, oauthParams, consumerSecret);
  oauthParams.oauth_signature = signature;

  // Build Authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ');

  return authHeader;
}

/**
 * Make authenticated request to Storedge API
 */
function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${config.baseUrl}${endpoint}`;
    const parsedUrl = new URL(url);

    console.log('\n=================================');
    console.log('Testing Storedge API Connection');
    console.log('=================================');
    console.log('URL:', url);
    console.log('Method: GET');
    console.log('Consumer Key:', config.consumerKey);
    console.log('---------------------------------\n');

    const authHeader = generateOAuthHeader('GET', url, config.consumerKey, config.consumerSecret);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    console.log('Authorization Header:', authHeader);
    console.log('\nMaking request...\n');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
        console.log('\nResponse Body:');
        
        try {
          const parsed = JSON.parse(data);
          console.log(JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          console.log(data);
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request Error:', error.message);
      reject(error);
    });

    req.end();
  });
}

/**
 * Run tests with a specific config
 */
async function runTestsWithConfig(testConfig, configName) {
  config = testConfig;
  let successCount = 0;
  let failCount = 0;

  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║  TESTING: ${configName.padEnd(48)} ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Facility ID: ${config.facilityId}`);
  console.log('');

  try {
    // Test 1: Fetch units
    console.log('TEST 1: Fetching Units');
    const unitsEndpoint = `/v1/${config.facilityId}/units`;
    const unitsResult = await makeRequest(unitsEndpoint);
    
    if (unitsResult.status === 200) {
      console.log('\n✅ SUCCESS: Units endpoint is working!');
      console.log(`Found ${unitsResult.data?.units?.length || 0} units`);
      successCount++;
    } else {
      console.log('\n❌ FAILED: Units endpoint returned status', unitsResult.status);
      failCount++;
    }

    console.log('\n\n');

    // Test 2: Fetch tenants
    console.log('TEST 2: Fetching Current Tenants');
    const tenantsEndpoint = `/v1/${config.facilityId}/tenants/current`;
    const tenantsResult = await makeRequest(tenantsEndpoint);
    
    if (tenantsResult.status === 200) {
      console.log('\n✅ SUCCESS: Tenants endpoint is working!');
      console.log(`Found ${tenantsResult.data?.tenants?.length || 0} tenants`);
      successCount++;
    } else {
      console.log('\n❌ FAILED: Tenants endpoint returned status', tenantsResult.status);
      failCount++;
    }

    console.log('\n\n');

    // Test 3: Fetch ledgers
    console.log('TEST 3: Fetching Current Ledgers');
    const ledgersEndpoint = `/v1/${config.facilityId}/ledgers/current`;
    const ledgersResult = await makeRequest(ledgersEndpoint);
    
    if (ledgersResult.status === 200) {
      console.log('\n✅ SUCCESS: Ledgers endpoint is working!');
      console.log(`Found ${ledgersResult.data?.ledgers?.length || 0} ledgers`);
      successCount++;
    } else {
      console.log('\n❌ FAILED: Ledgers endpoint returned status', ledgersResult.status);
      failCount++;
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:');
    console.error(error);
    failCount++;
  }

  return { successCount, failCount };
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('    STOREDGE API CONNECTION TESTS');
  console.log('═══════════════════════════════════════════════════════════');

  // Test with dashes
  const resultsWithDashes = await runTestsWithConfig(configWithDashes, 'Facility ID WITH dashes');
  
  // Test without dashes
  const resultsWithoutDashes = await runTestsWithConfig(configWithoutDashes, 'Facility ID WITHOUT dashes');

  // Summary
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('    SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`WITH dashes (${configWithDashes.facilityId}):`);
  console.log(`  ✅ Passed: ${resultsWithDashes.successCount}`);
  console.log(`  ❌ Failed: ${resultsWithDashes.failCount}`);
  console.log('');
  console.log(`WITHOUT dashes (${configWithoutDashes.facilityId}):`);
  console.log(`  ✅ Passed: ${resultsWithoutDashes.successCount}`);
  console.log(`  ❌ Failed: ${resultsWithoutDashes.failCount}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run all tests
runAllTests();

