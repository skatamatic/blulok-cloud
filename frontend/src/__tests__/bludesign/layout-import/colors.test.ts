/**
 * Tests for the layout-import color/format helpers.
 */

import {
  hexToRgba,
  confidenceTier,
  confidenceTextClass,
  unitAccentColor,
  overlayColor,
  formatPct,
  isUnlabeledRectangle,
  OVERLAY_BORDER,
  OVERLAY_FILL,
  ERROR_COLOR,
  UNIT_COLOR,
  NON_UNIT_COLOR,
} from '@/components/bludesign/layout-import/colors';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

const makeUnit = (overrides: Partial<EditableUnit> = {}): EditableUnit => ({
  id: 'u1',
  kind: 'unit',
  bounds: { cx: 0, cy: 0, width: 10, height: 10 },
  rotationRad: 0,
  labelConfidence: 0,
  detectionConfidence: 0.9,
  ...overrides,
});

describe('hexToRgba', () => {
  it('parses 6-digit hex into rgba', () => {
    expect(hexToRgba('#147FD4', 0.5)).toBe('rgba(20, 127, 212, 0.5)');
    expect(hexToRgba('147FD4', 1)).toBe('rgba(20, 127, 212, 1)');
    expect(hexToRgba('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('confidenceTier', () => {
  it('buckets by threshold', () => {
    expect(confidenceTier(0.9)).toBe('high');
    expect(confidenceTier(0.7)).toBe('high');
    expect(confidenceTier(0.5)).toBe('medium');
    expect(confidenceTier(0.4)).toBe('medium');
    expect(confidenceTier(0.39)).toBe('low');
    expect(confidenceTier(0)).toBe('low');
  });
});

describe('confidenceTextClass', () => {
  it('maps tiers to tailwind classes', () => {
    expect(confidenceTextClass(0.8)).toBe('text-success-500');
    expect(confidenceTextClass(0.5)).toBe('text-warning-500');
    expect(confidenceTextClass(0.1)).toBe('text-error-500');
  });
});

describe('unitAccentColor', () => {
  it('returns blue for units and gray for unlabeled rectangles', () => {
    expect(unitAccentColor(makeUnit({ kind: 'unit' }))).toBe(UNIT_COLOR);
    expect(unitAccentColor(makeUnit({ kind: 'rectangle' }))).toBe(NON_UNIT_COLOR);
  });
});

describe('overlayColor', () => {
  it('uses the dark-blue border + light-blue fill for normal boxes', () => {
    const c = overlayColor(false, 0.25);
    expect(c.stroke).toBe(OVERLAY_BORDER);
    expect(c.fill).toBe(hexToRgba(OVERLAY_FILL, 0.25));
  });

  it('uses red for error boxes', () => {
    const c = overlayColor(true, 0.3);
    expect(c.stroke).toBe(ERROR_COLOR);
    expect(c.fill).toBe(hexToRgba(ERROR_COLOR, 0.3));
  });
});

describe('isUnlabeledRectangle', () => {
  it('is true only for rectangles without a readable label kind', () => {
    expect(isUnlabeledRectangle(makeUnit({ kind: 'rectangle' }))).toBe(true);
    expect(isUnlabeledRectangle(makeUnit({ kind: 'unit' }))).toBe(false);
  });
});

describe('formatPct', () => {
  it('rounds to a whole percent', () => {
    expect(formatPct(0.256)).toBe('26%');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(0)).toBe('0%');
  });
});
