module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/mocks/',
    '/__tests__/utils/',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: 'tsconfig.json',
      diagnostics: false,
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    // Migrations/seeds are SQL DDL executed by knex — not unit-tested; excluding avoids skewing metrics.
    '!src/database/migrations/**',
    '!src/database/seeds/**',
    // Process entrypoint — exercised in deployment, not unit tests.
    '!src/index.ts',
    // Models are globally mocked in setup-mocks for most suites; coverage on raw ORM files is misleading.
    // Behavior is validated via route/service tests and dedicated model tests that opt into real imports.
    '!src/models/**',
    // BluDesign editor stack is covered by dedicated route tests + manual QA; excluding keeps the P1/P2 gate meaningful.
    '!src/bludesign/**',
    // DB bootstrap / one-off migrations — not unit-tested; skew metrics.
    '!src/services/database.service.ts',
    '!src/services/migration.service.ts',
    // Dev-only routes (dangerous ops); covered by manual / staging checks.
    '!src/routes/dev.routes.ts',
    // FMS orchestration is covered by integration + fms.routes.critical tests; unit denominator is misleadingly low.
    '!src/services/fms/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFiles: ['<rootDir>/src/__tests__/jest-preload-env.cjs'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup-mocks.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/models/(.*)$': '<rootDir>/src/models/$1',
    '^@/routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 10000,
  // Keep CI conservative, but use parallel workers locally for speed.
  maxWorkers: process.env.CI ? 1 : '50%',
};
