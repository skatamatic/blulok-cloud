/**
 * Tests for post-detection ingest heuristics.
 */

import {
  filterDetectedUnits,
  isRectangleLike,
} from '../detection/postProcess';
import type { DetectedUnitCandidate } from '../types';

function unit(
  id: string,
  overrides: Partial<DetectedUnitCandidate> = {}
): DetectedUnitCandidate {
  return {
    id,
    kind: 'unit',
    bounds: { cx: 50, cy: 50, width: 40, height: 80 },
    rotationRad: 0,
    label: '101',
    labelConfidence: 0.9,
    detectionConfidence: 0.92,
    ...overrides,
  };
}

describe('isRectangleLike', () => {
  it('accepts a typical storage unit rectangle', () => {
    expect(isRectangleLike(unit('a'))).toBe(true);
  });

  it('rejects circle-like shapes (square bbox, low fill)', () => {
    expect(
      isRectangleLike(
        unit('c', {
          bounds: { cx: 0, cy: 0, width: 30, height: 30 },
          detectionConfidence: 0.78,
        })
      )
    ).toBe(false);
  });
});

describe('filterDetectedUnits', () => {
  it('drops unlabeled shapes', () => {
    const { kept, warnings } = filterDetectedUnits([
      unit('a'),
      unit('b', { label: undefined, kind: 'rectangle' }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('a');
    expect(warnings.some((w) => w.includes('no readable label'))).toBe(true);
  });

  it('drops tiny outliers relative to the median unit size', () => {
    const big = unit('big', { bounds: { cx: 0, cy: 0, width: 100, height: 200 } });
    const tiny = unit('tiny', {
      label: '999',
      bounds: { cx: 10, cy: 10, width: 5, height: 5 },
    });
    const { kept } = filterDetectedUnits([big, big, big, tiny]);
    expect(kept.map((u) => u.id)).not.toContain('tiny');
  });
});
