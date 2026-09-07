/** Jest stub for pdfjs-dist (ESM + import.meta not supported in Jest without extra config). */
module.exports = {
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: jest.fn(() =>
        Promise.resolve({
          getViewport: jest.fn(() => ({ width: 100, height: 100 })),
          render: jest.fn(() => ({ promise: Promise.resolve(undefined) })),
        }),
      ),
    }),
  })),
  version: '0.0.0-mock',
};
