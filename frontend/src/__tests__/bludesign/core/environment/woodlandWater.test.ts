import {
  carveWoodlandWaterHeight,
  computeWoodlandWaterLayout,
  woodlandWaterSignedDistance,
  WOODLAND_RIVER_POINT_COUNT,
  type WoodlandWaterMetrics,
} from '@/components/bludesign/core/environment/woodlandWater';
import { sampleWoodlandTerrainHeight } from '@/components/bludesign/core/environment/woodlandTerrain';
import { computeWoodlandTreePlacements } from '@/components/bludesign/core/environment/woodlandTreePlacements';

const largeField: WoodlandWaterMetrics = {
  centerX: 0,
  centerZ: 0,
  padHalfX: 30,
  padHalfZ: 25,
  facilityHalfX: 28,
  facilityHalfZ: 23,
  fadeStart: 200,
  outerFade: 900,
};

const smallField: WoodlandWaterMetrics = {
  centerX: 0,
  centerZ: 0,
  padHalfX: 20,
  padHalfZ: 15,
  facilityHalfX: 18,
  facilityHalfZ: 13,
  fadeStart: 55,
};

const SEED = 'facility-water-001';

describe('computeWoodlandWaterLayout', () => {
  it('produces a river and pond for a large woodland field', () => {
    const layout = computeWoodlandWaterLayout(largeField, SEED);
    expect(layout.enabled).toBe(true);
    expect(layout.rivers.length).toBe(1);
    expect(layout.rivers[0].points.length).toBe(WOODLAND_RIVER_POINT_COUNT);
    expect(layout.rivers[0].halfWidth).toBeGreaterThan(0);
    expect(layout.ponds.length).toBe(1);
  });

  it('is deterministic for the same seed and varies by seed', () => {
    const a = computeWoodlandWaterLayout(largeField, SEED);
    const b = computeWoodlandWaterLayout(largeField, SEED);
    const c = computeWoodlandWaterLayout(largeField, 'different-seed');
    expect(a).toEqual(b);
    expect(a.rivers[0].points).not.toEqual(c.rivers[0].points);
  });

  it('honours river/pond count options (clamped to the maxima)', () => {
    const many = computeWoodlandWaterLayout(largeField, SEED, { riverCount: 3, pondCount: 4 });
    expect(many.rivers.length).toBe(3);
    expect(many.ponds.length).toBeGreaterThan(0);
    expect(many.ponds.length).toBeLessThanOrEqual(4);

    const overMax = computeWoodlandWaterLayout(largeField, SEED, { riverCount: 9, pondCount: 9 });
    expect(overMax.rivers.length).toBe(3);
    expect(overMax.ponds.length).toBeLessThanOrEqual(4);

    const none = computeWoodlandWaterLayout(largeField, SEED, { riverCount: 0, pondCount: 0 });
    expect(none.enabled).toBe(false);
    expect(none.rivers.length).toBe(0);
    expect(none.ponds.length).toBe(0);
  });

  it('scales carved depth with the depth option', () => {
    const shallow = computeWoodlandWaterLayout(largeField, SEED, { depthScale: 0.5 });
    const deep = computeWoodlandWaterLayout(largeField, SEED, { depthScale: 2 });
    expect(deep.bedDepth).toBeGreaterThan(shallow.bedDepth);
  });

  it('disables water when the field is too small to host it', () => {
    const layout = computeWoodlandWaterLayout(smallField, SEED);
    expect(layout.enabled).toBe(false);
    expect(layout.rivers.length).toBe(0);
  });

  it('keeps water clear of the flat facility clearing', () => {
    const layout = computeWoodlandWaterLayout(largeField, SEED);
    // Sampling across the clearing should never report being inside water.
    for (let x = -40; x <= 40; x += 8) {
      for (let z = -35; z <= 35; z += 8) {
        expect(woodlandWaterSignedDistance(x, z, layout)).toBeGreaterThan(0);
      }
    }
  });
});

describe('carveWoodlandWaterHeight', () => {
  it('sinks the channel below the waterline and leaves far terrain untouched', () => {
    const layout = computeWoodlandWaterLayout(largeField, SEED);
    const center = layout.rivers[0].points[3];

    const carved = sampleWoodlandTerrainHeight(
      center.x,
      center.z,
      largeField.centerX,
      largeField.centerZ,
      largeField.padHalfX,
      largeField.padHalfZ,
      SEED,
      undefined,
      layout
    );
    expect(carved).toBeLessThan(layout.waterLevelY);

    // A point well beyond the bank influence is unaffected by the carve.
    const signedFar = 1000;
    expect(carveWoodlandWaterHeight(7.5, signedFar, layout)).toBe(7.5);
    // At the shoreline the ground meets the waterline.
    expect(carveWoodlandWaterHeight(7.5, 0, layout)).toBeCloseTo(layout.waterLevelY, 5);
  });
});

describe('woodland trees avoid water', () => {
  it('never places trees or shrubs inside the river or pond', () => {
    const layout = computeWoodlandWaterLayout(largeField, SEED);
    expect(layout.enabled).toBe(true);

    const placements = computeWoodlandTreePlacements({
      ...largeField,
      environmentSeed: SEED,
    });
    expect(placements.length).toBeGreaterThan(0);

    for (const p of placements) {
      expect(woodlandWaterSignedDistance(p.x, p.z, layout)).toBeGreaterThan(0);
    }
  });
});
