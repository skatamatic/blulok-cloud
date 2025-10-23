import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (needed for supertest)
import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Polyfill for setImmediate (needed for Express)
(global as any).setImmediate = (callback: (...args: any[]) => void, ...args: any[]) => {
  return setTimeout(callback, 0, ...args);
};

// Mock import.meta for Vite environment variables
Object.defineProperty(globalThis, 'import.meta', {
  value: {
    env: {
      VITE_API_URL: 'http://localhost:3000',
      VITE_WS_URL: 'ws://localhost:3000',
      VITE_GOOGLE_MAPS_API_KEY: 'test-api-key',
    },
  },
  writable: true,
  configurable: true,
});

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() { return []; }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Suppress console errors, warnings, and logs during tests to reduce noise
// Tests can still override this if they need to verify console output
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  console.error = jest.fn((...args: any[]) => {
    // Only log React warnings and critical errors, suppress everything else
    const message = args[0]?.toString() || '';
    if (message.includes('Warning:') || (message.includes('Error:') && !message.includes('Failed to'))) {
      originalError(...args);
    }
  });
  
  console.warn = jest.fn(() => {
    // Suppress all warnings during tests
  });
  
  console.log = jest.fn(() => {
    // Suppress all logs during tests
  });
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});
