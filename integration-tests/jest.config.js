module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Changed from 'node' to 'jsdom' for frontend integration
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/src/__tests__/full-api-integration.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  testTimeout: 30000, // 30 seconds for integration tests
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../backend/src/$1',
    '^@frontend/(.*)$': '<rootDir>/../frontend/src/$1',
  },
  // Fix circular reference issues
  maxWorkers: 1,
  workerIdleMemoryLimit: '512MB',
  // Suppress console logs during tests to reduce noise
  silent: false,
  verbose: false,
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/src/setup-mocks.ts', '<rootDir>/src/setup-frontend-integration.ts'],
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  // Global variables for frontend integration
  globals: {
    'process.env': {
      NODE_ENV: 'test',
      VITE_API_URL: 'http://localhost:3000'
    }
  }
};
