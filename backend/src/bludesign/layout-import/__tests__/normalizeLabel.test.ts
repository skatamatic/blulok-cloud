/**
 * Fast, pure tests for OCR label normalization. No Tesseract worker is spun up
 * here — only the string-normalization function is exercised.
 */

import { normalizeLabel } from '../ocr/ocrLabels';

describe('normalizeLabel', () => {
  it('returns a plain number unchanged', () => {
    expect(normalizeLabel('26')).toBe('26');
  });

  it('keeps a trailing suffix letter', () => {
    expect(normalizeLabel('26A')).toBe('26A');
  });

  it('uppercases suffix letters', () => {
    expect(normalizeLabel('26a')).toBe('26A');
  });

  it('strips surrounding whitespace and punctuation', () => {
    expect(normalizeLabel('  26 ')).toBe('26');
    expect(normalizeLabel('#26.')).toBe('26');
  });

  it('extracts the first label-like token from noisy text', () => {
    expect(normalizeLabel('Unit 26 ')).toBe('26');
    expect(normalizeLabel('x88')).toBe('88'); // leading stray glyph dropped
  });

  it('returns undefined for empty or label-less input', () => {
    expect(normalizeLabel('')).toBeUndefined();
    expect(normalizeLabel('   ')).toBeUndefined();
    expect(normalizeLabel('!!!')).toBeUndefined();
  });

  it('handles three-digit labels', () => {
    expect(normalizeLabel('103')).toBe('103');
  });
});
