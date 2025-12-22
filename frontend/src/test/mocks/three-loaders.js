// Mock for three/examples/jsm/loaders to avoid ESM import issues in Jest
// This mock handles GLTFLoader, DRACOLoader, FBXLoader, etc.

const createLoaderMock = () => ({
  load: jest.fn((url, onLoad, onProgress, onError) => {
    // Simulate async loading
    setTimeout(() => {
      if (onLoad) {
        onLoad({
          scene: {
            traverse: jest.fn(),
            children: [],
          },
          animations: [],
          cameras: [],
          asset: {},
        });
      }
    }, 0);
  }),
  setPath: jest.fn().mockReturnThis(),
  setDRACOLoader: jest.fn().mockReturnThis(),
  parse: jest.fn(),
  dispose: jest.fn(),
});

module.exports = createLoaderMock();

// Export named exports for different loaders
module.exports.GLTFLoader = createLoaderMock();
module.exports.DRACOLoader = createLoaderMock();
module.exports.FBXLoader = createLoaderMock();


