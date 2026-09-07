/**
 * Tests for the Build-in-3D wizard asset generation helpers.
 */

import {
  bucketToAssetInput,
  bucketUnits,
  defaultDoorDimensions,
  DEFAULT_UNIT_HEIGHT_M,
  doorSideToLockerSide,
  findMatchingAssetForBucket,
  layoutSignaturesMatch,
  parseAutoLayoutSignature,
  resolveAssetIdForBucket,
  signatureOf,
  unitRealSpec,
} from '@/components/bludesign/layout-import/build-wizard/assetSpec';
import { feetToMeters } from '@/components/bludesign/core/types';
import type { DoorSide, EditableUnit } from '@/components/bludesign/layout-import/types';

function unit(
  id: string,
  width: number,
  height: number,
  door?: { side: DoorSide; widthFraction: number; offsetFraction: number }
): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx: 0, cy: 0, width, height },
    rotationRad: 0,
    labelConfidence: 1,
    detectionConfidence: 1,
    door: door ? { ...door, auto: true } : undefined,
  };
}

// 1 px = 0.1 ft, so 0.030480 m/px.
const MPP = feetToMeters(0.1);

describe('doorSideToLockerSide', () => {
  it('maps 2D sides to 3D locker sides', () => {
    expect(doorSideToLockerSide('top')).toBe('back');
    expect(doorSideToLockerSide('bottom')).toBe('front');
    expect(doorSideToLockerSide('left')).toBe('left');
    expect(doorSideToLockerSide('right')).toBe('right');
  });
});

describe('unitRealSpec', () => {
  it('computes real dimensions from pixel bounds', () => {
    const spec = unitRealSpec(unit('a', 100, 200), MPP);
    expect(spec.width).toBeCloseTo(feetToMeters(10), 5);
    expect(spec.depth).toBeCloseTo(feetToMeters(20), 5);
    expect(spec.height).toBeCloseTo(feetToMeters(8), 5);
  });

  it('places the door with a header band and sill offset like outdoor roll-up units', () => {
    const spec = unitRealSpec(unit('a', 100, 200), MPP);
    const { doorHeight, doorPositionY } = defaultDoorDimensions(DEFAULT_UNIT_HEIGHT_M);
    expect(spec.lockerSpec.doorHeight).toBeCloseTo(doorHeight, 5);
    expect(spec.lockerSpec.doorPositionY).toBeCloseTo(doorPositionY, 5);
    // ~88% of total height on an 8 ft unit (10% header + small base gap).
    expect(spec.lockerSpec.doorHeight / spec.height).toBeCloseTo(0.88, 1);
  });

  it('maps a bottom door to a front locker door using the width edge', () => {
    // bottom door => edge length is the width (100 px = 10 ft)
    const spec = unitRealSpec(unit('a', 100, 200, { side: 'bottom', widthFraction: 0.8, offsetFraction: 0 }), MPP);
    expect(spec.lockerSpec.doorSide).toBe('front');
    expect(spec.lockerSpec.doorWidth).toBeCloseTo(feetToMeters(8), 5); // 0.8 * 10 ft
    expect(spec.lockerSpec.doorPositionX).toBeCloseTo(0, 6);
  });

  it('maps a right door using the height edge and carries the offset', () => {
    // right door => edge length is the height (200 px = 20 ft)
    const spec = unitRealSpec(
      unit('a', 100, 200, { side: 'right', widthFraction: 0.5, offsetFraction: 0.25 }),
      MPP
    );
    expect(spec.lockerSpec.doorSide).toBe('right');
    expect(spec.lockerSpec.doorWidth).toBeCloseTo(feetToMeters(10), 5); // 0.5 * 20 ft
    expect(spec.lockerSpec.doorPositionX).toBeCloseTo(feetToMeters(5), 5); // 0.25 * 20 ft
  });

  it('falls back to a centered front door when none is assigned', () => {
    const spec = unitRealSpec(unit('a', 100, 200), MPP);
    expect(spec.lockerSpec.doorSide).toBe('front');
    expect(spec.lockerSpec.doorPositionX).toBe(0);
    expect(spec.lockerSpec.doorWidth).toBeCloseTo(0.8 * feetToMeters(10), 5);
  });
});

describe('bucketUnits', () => {
  it('collapses identical units into one shared asset', () => {
    const units = [
      unit('a', 100, 200, { side: 'bottom', widthFraction: 0.8, offsetFraction: 0 }),
      unit('b', 100, 200, { side: 'bottom', widthFraction: 0.8, offsetFraction: 0 }),
    ];
    const buckets = bucketUnits(units, MPP);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].unitIds.sort()).toEqual(['a', 'b']);
  });

  it('separates units with different dimensions', () => {
    const units = [unit('a', 100, 200), unit('b', 150, 300)];
    const buckets = bucketUnits(units, MPP);
    expect(buckets).toHaveLength(2);
  });

  it('groups near-identical units within tolerance', () => {
    // 100 px (10.0 ft) and 102 px (10.2 ft) both snap to 10.0 ft at 0.5 ft tolerance.
    const units = [unit('a', 100, 200), unit('b', 102, 200)];
    const buckets = bucketUnits(units, MPP, { toleranceM: feetToMeters(0.5) });
    expect(buckets).toHaveLength(1);
  });

  it('separates different door sides', () => {
    const units = [
      unit('a', 100, 200, { side: 'bottom', widthFraction: 0.8, offsetFraction: 0 }),
      unit('b', 100, 200, { side: 'top', widthFraction: 0.8, offsetFraction: 0 }),
    ];
    expect(bucketUnits(units, MPP)).toHaveLength(2);
  });
});

describe('bucketToAssetInput / signatureOf', () => {
  it('produces a primitive storage_unit input with a recoverable signature', () => {
    const [bucket] = bucketUnits([unit('a', 100, 200)], MPP);
    const input = bucketToAssetInput(bucket);
    expect(input.category).toBe('storage_unit');
    expect(input.modelType).toBe('primitive');
    expect(input.isSmart).toBe(true);
    expect(input.lockerSpec).toBeDefined();
    expect(input.gridUnits.x).toBeGreaterThanOrEqual(1);
    expect(input.gridUnits.z).toBeGreaterThanOrEqual(1);
    expect(signatureOf(input.description)).toBe(bucket.signature);
  });

  it('returns null when no signature is present', () => {
    expect(signatureOf('A regular asset')).toBeNull();
    expect(signatureOf(undefined)).toBeNull();
  });
});

describe('findMatchingAssetForBucket', () => {
  it('reuses an existing asset with matching dimensions and door layout', () => {
    const [bucket] = bucketUnits([unit('a', 100, 200)], MPP);
    const existingId = 'existing-asset-id';
    const match = findMatchingAssetForBucket(bucket, [
      {
        id: existingId,
        category: 'storage_unit',
        modelType: 'primitive',
        dimensions: bucket.dimensions,
        lockerSpec: bucket.lockerSpec,
        description: 'Hand-built unit',
      },
    ], feetToMeters(0.5));
    expect(match).toBe(existingId);
  });

  it('matches assets using the autolayout signature when lockerSpec is missing', () => {
    const [bucket] = bucketUnits([unit('a', 100, 200)], MPP);
    const existingId = 'sig-only-id';
    const match = findMatchingAssetForBucket(bucket, [
      {
        id: existingId,
        category: 'storage_unit',
        modelType: 'primitive',
        dimensions: bucket.dimensions,
        description: `[${bucket.signature}] Auto-generated from layout import`,
      },
    ], feetToMeters(0.5));
    expect(match).toBe(existingId);
  });

  it('treats missing doorPositionY as zero', () => {
    const [bucket] = bucketUnits([unit('a', 100, 200)], MPP);
    const existingId = 'missing-y-id';
    const lockerSpec = { ...bucket.lockerSpec };
    delete (lockerSpec as { doorPositionY?: number }).doorPositionY;
    const match = findMatchingAssetForBucket(bucket, [
      {
        id: existingId,
        category: 'storage_unit',
        modelType: 'primitive',
        dimensions: bucket.dimensions,
        lockerSpec,
      },
    ], feetToMeters(0.5));
    expect(match).toBe(existingId);
  });
});

describe('resolveAssetIdForBucket', () => {
  it('reuses by fuzzy signature when numeric components differ within tolerance', () => {
    const [bucket] = bucketUnits([unit('a', 100, 200)], MPP);
    const existingId = 'existing-signature-id';
    const parsed = parseAutoLayoutSignature(bucket.signature);
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    const shifted = {
      ...parsed,
      width: parsed.width + feetToMeters(0.2),
      doorWidth: parsed.doorWidth + feetToMeters(0.2),
    };
    expect(layoutSignaturesMatch(parsed, shifted, feetToMeters(0.5))).toBe(true);

    const shiftedSig = `autolayout:${shifted.width.toFixed(3)}x${shifted.height.toFixed(3)}x${shifted.depth.toFixed(3)}|${shifted.doorSide}|w${shifted.doorWidth.toFixed(3)}|h${shifted.doorHeight.toFixed(3)}|o${shifted.doorOffset.toFixed(3)}`;
    const existing = [
      {
        id: existingId,
        category: 'storage_unit',
        modelType: 'primitive',
        dimensions: {
          width: shifted.width,
          height: shifted.height,
          depth: shifted.depth,
        },
        lockerSpec: {
          doorSide: shifted.doorSide,
          doorWidth: shifted.doorWidth,
          doorHeight: shifted.doorHeight,
          doorPositionX: shifted.doorOffset,
          doorPositionY: 0,
        },
        description: `[${bucket.signature}] Auto-generated from layout import`,
      },
    ];
    const sigToId = new Map<string, string>([[bucket.signature, existingId]]);

    const resolution = resolveAssetIdForBucket(
      { ...bucket, signature: shiftedSig },
      sigToId,
      existing,
      feetToMeters(0.5)
    );

    expect(resolution?.assetId).toBe(existingId);
    expect(resolution?.matchKind).toBe('fuzzy-signature');
  });
});
