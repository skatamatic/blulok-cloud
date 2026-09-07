/**
 * Tests for the Build-in-3D wizard scale calibration helpers.
 */

import {
  metersPerPixelFromRatio,
  metersPerPixelFromUnit,
  medianUnitFootprintFeet,
  toMeters,
} from '@/components/bludesign/layout-import/build-wizard/scale';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

function unit(id: string, width: number, height: number): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx: 0, cy: 0, width, height },
    rotationRad: 0,
    labelConfidence: 1,
    detectionConfidence: 1,
  };
}

describe('toMeters', () => {
  it('converts feet and passes meters through', () => {
    expect(toMeters(10, 'ft')).toBeCloseTo(3.048, 6);
    expect(toMeters(3.048, 'm')).toBeCloseTo(3.048, 6);
  });
});

describe('metersPerPixelFromRatio', () => {
  it('divides a real length by the measured pixel length', () => {
    // 20 ft over 100 px => 6.096 m / 100 px
    expect(metersPerPixelFromRatio(20, 'ft', 100)).toBeCloseTo(0.06096, 6);
  });

  it('returns 0 for invalid inputs', () => {
    expect(metersPerPixelFromRatio(20, 'ft', 0)).toBe(0);
    expect(metersPerPixelFromRatio(0, 'ft', 100)).toBe(0);
  });
});

describe('metersPerPixelFromUnit', () => {
  it('averages width and depth ratios', () => {
    // 100x200 px unit measuring 10x20 ft => both ratios equal 0.03048
    const mpp = metersPerPixelFromUnit(unit('a', 100, 200), 10, 20, 'ft');
    expect(mpp).toBeCloseTo(0.03048, 6);
  });

  it('uses only the available dimension when one is missing', () => {
    const mpp = metersPerPixelFromUnit(unit('a', 100, 200), 10, 0, 'ft');
    expect(mpp).toBeCloseTo(0.03048, 6);
  });
});

describe('medianUnitFootprintFeet', () => {
  it('reports the median footprint in feet', () => {
    const mpp = 0.03048; // 1 px = 0.1 ft
    const units = [unit('a', 100, 200), unit('b', 100, 200), unit('c', 50, 100)];
    const result = medianUnitFootprintFeet(units, mpp);
    expect(result).not.toBeNull();
    expect(result!.widthFt).toBeCloseTo(10, 3);
    expect(result!.depthFt).toBeCloseTo(20, 3);
  });

  it('returns null without a valid scale', () => {
    expect(medianUnitFootprintFeet([unit('a', 100, 200)], 0)).toBeNull();
  });
});
