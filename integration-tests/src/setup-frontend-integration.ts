/**
 * Setup file for frontend-backend integration tests
 * 
 * This file sets up the necessary environment for testing
 * the actual integration between frontend and backend.
 */

// Mock localStorage for jsdom environment
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock window.location for jsdom environment
const mockLocation = {
  href: '',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
};

// Set up global mocks
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock location more carefully
delete (window as any).location;
(window as any).location = mockLocation;

// Mock console methods to reduce noise during tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up environment variables
process.env.NODE_ENV = 'test';
process.env.VITE_API_URL = 'http://localhost:3000';

// Export the mocks for use in tests
export { localStorageMock, mockLocation };
