import { degToRad } from '@/components/bludesign/layout-import/geometry';
import {
  groupByOrientationBucket,
  isRowStrip,
  medianRotation,
  orientationBucket,
  snapAlignUnits,
} from '@/components/bludesign/layout-import/snapAlign';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

function unit(
  id: string,
  cx: number,
  cy: number,
  width: number,
  height: number,
  rotationDeg = 0
): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx, cy, width, height },
    rotationRad: degToRad(rotationDeg),
    label: id,
    labelConfidence: 1,
    detectionConfidence: 1,
    manual: false,
    edited: false,
  };
}

describe('medianRotation', () => {
  it('keeps vertical orientations near ±90°', () => {
    const med = medianRotation([degToRad(90), degToRad(-87), degToRad(-86)]);
    expect(Math.abs(med)).toBeGreaterThan(degToRad(80));
    expect(Math.abs(med)).toBeLessThan(degToRad(95));
  });
});

describe('orientationBucket', () => {
  it('groups 90° with −87° as vertical', () => {
    expect(orientationBucket(degToRad(90))).toBe('vertical');
    expect(orientationBucket(degToRad(-87))).toBe('vertical');
    expect(orientationBucket(degToRad(2))).toBe('horizontal');
  });
});

describe('snapAlignUnits', () => {
  it('leaves isolated units unchanged', () => {
    const units = [unit('a', 100, 100, 40, 30)];
    expect(snapAlignUnits(units)).toBe(units);
  });

  it('straightens a jagged vertical locker row', () => {
    const units = [
      unit('1', 100, 420, 30, 20, 90),
      unit('2', 120, 421, 30, 20, -87),
      unit('3', 140, 419, 30, 20, -86),
      unit('4', 160, 422, 30, 20, 90),
    ];
    const out = snapAlignUnits(units);
    expect(out.every((u) => u.edited)).toBe(true);
    expect(isRowStrip(out)).toBe(true);
  });

  it('only adjusts selected ids when onlyIds is set', () => {
    const units = [
      unit('1', 100, 100, 40, 30, 90),
      unit('2', 130, 108, 40, 30, 90),
      unit('3', 160, 104, 40, 30, 90),
      unit('x', 400, 400, 40, 30, 90),
    ];
    const out = snapAlignUnits(units, { onlyIds: new Set(['1', '2', '3']) });
    expect(out.find((u) => u.id === 'x')).toBe(units[3]);
    expect(out.some((u) => u.id !== 'x' && u.edited)).toBe(true);
  });

  it('groups vertical and horizontal separately', () => {
    const units = [
      unit('1', 100, 420, 30, 20, 90),
      unit('2', 120, 421, 30, 20, 88),
      unit('3', 300, 428, 38, 30, 2),
      unit('4', 340, 429, 38, 30, 2),
    ];
    const buckets = groupByOrientationBucket(units);
    expect(buckets).toHaveLength(2);
    const out = snapAlignUnits(units);
    expect(Math.abs(out[0].rotationRad)).toBeGreaterThan(degToRad(80));
    expect(Math.abs(out[2].rotationRad)).toBeLessThan(degToRad(10));
  });
});
