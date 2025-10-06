# Blulok Cloud Integration Tests

This directory contains integration tests that verify the API contracts between the frontend and backend.

## What This Tests

- **Real HTTP Communication**: Tests actual HTTP requests between frontend and backend
- **API Contracts**: Ensures frontend and backend agree on request/response formats
- **Authentication Flow**: Tests login/logout and token handling
- **Data Validation**: Verifies data is properly validated and transformed
- **Error Handling**: Tests error responses and status codes

## How It Works

1. **Starts Real Backend**: Spins up the actual backend server with test database
2. **Makes Real HTTP Calls**: Uses axios to make actual HTTP requests
3. **Tests API Contracts**: Verifies request/response formats match expectations
4. **Cleans Up**: Properly shuts down servers after tests

## Running Tests

```bash
# Install dependencies
npm install

# Run all integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests for CI
npm run test:ci
```

## Environment Variables

Set these environment variables for your test database:

```bash
export TEST_DB_HOST=localhost
export TEST_DB_PORT=3306
export TEST_DB_USER=root
export TEST_DB_PASSWORD=your_password
export TEST_DB_NAME=blulok_test
export JWT_SECRET=your_jwt_secret
```

## Test Structure

- `src/setup.ts` - Test environment setup and teardown
- `src/api-client.ts` - HTTP client for making API calls
- `src/__tests__/api-contract.test.ts` - Main integration tests

## Why This Approach?

This is the **industry standard** for integration testing because it:

1. **Tests Real Communication**: No mocks, real HTTP calls
2. **Catches Contract Breaks**: If frontend/backend contracts change, tests fail
3. **Simple & Reliable**: Easy to understand and maintain
4. **Fast Feedback**: Quickly identifies integration issues
5. **CI/CD Ready**: Works perfectly in continuous integration

## Adding New Tests

To add tests for new API endpoints:

1. Add methods to `ApiClient` in `src/api-client.ts`
2. Add test cases in `src/__tests__/api-contract.test.ts`
3. Follow the existing patterns for authentication and error handling

This approach is used by companies like Netflix, Uber, and Airbnb for their integration testing.
