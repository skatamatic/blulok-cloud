// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Set test database environment variables
process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.TEST_DB_PORT = process.env.TEST_DB_PORT || '3306';
process.env.TEST_DB_USER = process.env.TEST_DB_USER || 'root';
process.env.TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'blulok_test';

// Global test timeout
jest.setTimeout(30000);

// Global test setup and teardown
beforeAll(async () => {
  // Setup test database
  const { setupTestDb } = await import('./test-database');
  await setupTestDb();
});

afterAll(async () => {
  // Teardown test database
  const { teardownTestDb } = await import('./test-database');
  await teardownTestDb();
});

// Clean database between tests
beforeEach(async () => {
  const { cleanTestDb } = await import('./test-database');
  await cleanTestDb();
});
