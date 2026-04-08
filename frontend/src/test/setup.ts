import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (needed for supertest)
import { TextEncoder, TextDecoder } from 'util';
type GlobalWithPolyfills = typeof globalThis & {
  setImmediate?: typeof setImmediate;
  IntersectionObserver: typeof IntersectionObserver;
};
const globalWithPolyfills = global as GlobalWithPolyfills;

Object.defineProperty(globalThis, 'TextEncoder', {
  writable: true,
  configurable: true,
  value: TextEncoder as unknown as typeof globalThis.TextEncoder,
});
Object.defineProperty(globalThis, 'TextDecoder', {
  writable: true,
  configurable: true,
  value: TextDecoder as unknown as typeof globalThis.TextDecoder,
});

// Polyfill for setImmediate (needed for Express)
globalWithPolyfills.setImmediate = ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
  return setTimeout(callback, 0, ...args);
}) as unknown as typeof setImmediate;

// Mock import.meta for Vite environment variables
Object.defineProperty(globalThis, 'import.meta', {
  value: {
    env: {
      DEV: false,
      VITE_API_URL: 'http://localhost:3000',
      VITE_WS_URL: 'ws://localhost:3000',
      VITE_GOOGLE_MAPS_API_KEY: 'test-api-key',
    },
  },
  writable: true,
  configurable: true,
});

// Mock IntersectionObserver
globalWithPolyfills.IntersectionObserver = class IntersectionObserver {
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
  console.error = jest.fn((...args: unknown[]) => {
    // Suppress React warnings about act(), deprecated APIs, and non-boolean attributes
    // Only show actual test failures and critical errors
    const message = args[0]?.toString() || '';
    const shouldSuppress = 
      message.includes('ReactDOMTestUtils.act') ||
      message.includes('not wrapped in act') ||
      message.includes('non-boolean attribute') ||
      message.includes('Warning:');
    
    if (!shouldSuppress && message.includes('Error:')) {
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
