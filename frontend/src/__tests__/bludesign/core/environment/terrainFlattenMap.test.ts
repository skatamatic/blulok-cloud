import {
  boxDistanceXZ,
  computeFlattenInfluence,
} from '@/components/bludesign/core/environment/terrainFlattenMap';

describe('terrain flatten map', () => {
  const footprint = { minX: 0, minZ: 0, maxX: 4, maxZ: 2 };

  it('returns 0 distance inside footprint', () => {
    expect(boxDistanceXZ(2, 1, footprint)).toBe(0);
  });

  it('returns edge distance outside footprint', () => {
    expect(boxDistanceXZ(6, 1, footprint)).toBeCloseTo(2, 5);
    expect(boxDistanceXZ(2, 4, footprint)).toBeCloseTo(2, 5);
  });

  it('ramps influence from full at asset edge to zero at fade distance', () => {
    expect(computeFlattenInfluence(0, 8, 1)).toBeCloseTo(1, 5);
    expect(computeFlattenInfluence(8, 8, 1)).toBeCloseTo(0, 5);
    expect(computeFlattenInfluence(0, 8, 0.5)).toBeCloseTo(0.5, 5);
  });
});
