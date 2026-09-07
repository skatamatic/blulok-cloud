/**
 * Runs before any test file or setupFilesAfterEnv (see jest.config.js `setupFiles`).
 * Ensures NODE_ENV=test before Winston or other modules open log file handles.
 */
process.env.NODE_ENV = 'test';
