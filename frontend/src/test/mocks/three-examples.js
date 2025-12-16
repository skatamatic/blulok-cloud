// Mock for three/examples/jsm modules to avoid ESM import issues in Jest
// This mock handles CSS2DRenderer
module.exports = jest.fn().mockImplementation(() => ({
  setSize: jest.fn(),
  render: jest.fn(),
  domElement: document.createElement('div'),
}));
