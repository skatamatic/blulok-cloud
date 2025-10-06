#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🔒 Running Security Test Suite...\n');

const securityTestPatterns = [
  '**/*security*.test.ts',
  '**/*rbac*.test.ts',
  '**/websocket-security.test.ts',
  '**/logger-interceptor-security.test.ts',
  '**/auth-service-rbac.test.ts'
];

const testFiles = securityTestPatterns.map(pattern => 
  `--testPathPattern="${pattern}"`
).join(' ');

const command = `npx jest ${testFiles} --verbose --coverage --coverageReporters=text --coverageReporters=html`;

try {
  console.log('Running command:', command);
  console.log('='.repeat(80));
  
  execSync(command, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Security tests completed successfully!');
  console.log('📊 Coverage report generated in coverage/ directory');
  
} catch (error) {
  console.error('\n❌ Security tests failed!');
  console.error('Error:', error.message);
  process.exit(1);
}