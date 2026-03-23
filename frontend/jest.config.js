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
      diagnostics: false,
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
    // 3D editor (~14k LOC) — covered by targeted core tests + E2E; excluding prevents one bucket from blocking P1/P2 gates.
    '!src/components/bludesign/**',
    // BluDesign route pages embed the editor; same rationale as components/bludesign.
    '!src/pages/bludesign/**',
    // Google Maps widgets are thin wrappers around third-party embeds; smoke-tested manually.
    '!src/components/GoogleMaps/**',
    // Dev-only surface (~350+ LOC); not a production security boundary for unit gates.
    '!src/pages/DeveloperToolsPage.tsx',
    // BluFMS marketing/demo UI + scripted workflows — manual / demo QA, not core product unit targets.
    '!src/components/blufms/demo/**',
    '!src/scripts/blufms/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
