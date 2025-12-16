export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@frontend/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^html2pdf\\.js$': '<rootDir>/src/test/mocks/html2pdf.js',
    '^three/examples/jsm/renderers/CSS2DRenderer\\.js$': '<rootDir>/src/test/mocks/three-examples.js',
    '^three/examples/jsm/controls/OrbitControls\\.js$': '<rootDir>/src/test/mocks/three-orbit-controls.js',
    '^three/examples/jsm/loaders/(.*)$': '<rootDir>/src/test/mocks/three-loaders.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(html2pdf\\.js|jspdf|@babel/runtime|three)/)',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/__tests__/integration/setup-integration.ts',
    '/src/__tests__/integration/simple-backend-mock.ts',
    '/src/__tests__/integration/real-backend-integration.ts',
    '/src/__tests__/integration/real-backend-integration.test.tsx'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test/**/*',
    '!src/main.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  forceExit: true,
};
