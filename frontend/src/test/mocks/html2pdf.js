// Mock for html2pdf.js to avoid ESM import issues in Jest
module.exports = jest.fn(() => ({
  set: jest.fn().mockReturnThis(),
  save: jest.fn().mockResolvedValue(undefined),
  from: jest.fn().mockReturnThis(),
  output: jest.fn().mockReturnThis(),
}));

