jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: jest.fn(),
}));
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'mock-worker', { virtual: true });

import * as pdfjsLib from 'pdfjs-dist';
import {
  ACCEPTED_FILE_TYPES,
  isPdfFile,
  peekSourcePageCount,
  validateSourceFile,
} from '@/components/bludesign/layout-import/loadSource';

const mockGetDocument = pdfjsLib.getDocument as jest.MockedFunction<typeof pdfjsLib.getDocument>;

function file(name: string, type: string): File {
  const blob = new Blob(['x'], { type });
  const f = new File([blob], name, { type });
  f.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
  return f;
}

describe('validateSourceFile', () => {
  it('accepts common raster and PDF extensions and mime types', () => {
    expect(validateSourceFile(file('plan.png', 'image/png'))).toBeNull();
    expect(validateSourceFile(file('plan.jpg', 'image/jpeg'))).toBeNull();
    expect(validateSourceFile(file('plan.webp', 'image/webp'))).toBeNull();
    expect(validateSourceFile(file('plan.pdf', 'application/pdf'))).toBeNull();
  });

  it('rejects unsupported types', () => {
    expect(validateSourceFile(file('plan.gif', 'image/gif'))).toMatch(/Unsupported file/);
    expect(validateSourceFile(file('plan.txt', 'text/plain'))).toMatch(/Unsupported file/);
  });

  it('rejects files larger than 25 MB', () => {
    const big = file('huge.png', 'image/png');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    expect(validateSourceFile(big)).toMatch(/too large/);
  });
});

describe('isPdfFile', () => {
  it('detects PDF by mime or extension', () => {
    expect(isPdfFile(file('a.pdf', 'application/pdf'))).toBe(true);
    expect(isPdfFile(file('A.PDF', ''))).toBe(true);
    expect(isPdfFile(file('a.png', 'image/png'))).toBe(false);
  });
});

describe('peekSourcePageCount', () => {
  it('returns 1 for raster images', async () => {
    await expect(peekSourcePageCount(file('a.png', 'image/png'))).resolves.toBe(1);
  });

  it('returns PDF page count from pdf.js', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 7 }),
    } as ReturnType<typeof pdfjsLib.getDocument>);

    await expect(peekSourcePageCount(file('a.pdf', 'application/pdf'))).resolves.toBe(7);
  });
});

describe('ACCEPTED_FILE_TYPES', () => {
  it('includes raster and PDF accept tokens', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('.pdf');
    expect(ACCEPTED_FILE_TYPES).toContain('image/png');
  });
});
