// Mock for OrbitControls specifically
module.exports = jest.fn().mockImplementation(() => ({
  enableDamping: jest.fn(),
  dampingFactor: 0.05,
  enableZoom: jest.fn(),
  enablePan: jest.fn(),
  enableRotate: jest.fn(),
  minDistance: 0,
  maxDistance: Infinity,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI,
  target: { x: 0, y: 0, z: 0 },
  update: jest.fn(),
  dispose: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

