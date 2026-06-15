import {
  CANADIAN_WOODLAND_TREE_IDS,
  computeWoodlandTreePlacements,
} from '@/components/bludesign/core/environment/woodlandTreePlacements';

describe('computeWoodlandTreePlacements', () => {
  const baseInput = {
    centerX: 0,
    centerZ: 0,
    padHalfX: 20,
    padHalfZ: 15,
    fadeStart: 55,
    facilityHalfX: 18,
    facilityHalfZ: 13,
    environmentSeed: 'facility-test-001',
  };

  it('is deterministic for the same seed', () => {
    const a = computeWoodlandTreePlacements(baseInput);
    const b = computeWoodlandTreePlacements(baseInput);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('changes layout when the seed changes', () => {
    const a = computeWoodlandTreePlacements(baseInput);
    const b = computeWoodlandTreePlacements({
      ...baseInput,
      environmentSeed: 'facility-test-002',
    });
    expect(a).not.toEqual(b);
  });

  it('only uses Canadian woodland tree assets (no palms)', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    for (const p of placements) {
      if (p.assetId === 'shrub-round') continue;
      expect(CANADIAN_WOODLAND_TREE_IDS).toContain(p.assetId);
      expect(p.assetId).not.toContain('palm');
    }
  });

  it('places trees outside the facility pad', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    for (const p of placements) {
      const relX = p.x - baseInput.centerX;
      const relZ = p.z - baseInput.centerZ;
      const outsidePad =
        Math.abs(relX) > baseInput.padHalfX + 0.5 ||
        Math.abs(relZ) > baseInput.padHalfZ + 0.5;
      expect(outsidePad).toBe(true);
    }
  });

  it('produces a visible density for typical facility bounds', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    expect(placements.length).toBeGreaterThanOrEqual(70);
    expect(placements.some((p) => p.assetId === 'shrub-round')).toBe(true);
  });

  it('increases tree count when density is raised', () => {
    const baseline = computeWoodlandTreePlacements(baseInput).length;
    const dense = computeWoodlandTreePlacements({ ...baseInput, treeDensity: 1.8 }).length;
    expect(dense).toBeGreaterThan(baseline);
  });

  it('does not collapse into a single-radius fairy ring', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    const radii = placements.map((p) =>
      Math.hypot(p.x - baseInput.centerX, p.z - baseInput.centerZ)
    );
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    const variance =
      radii.reduce((s, r) => s + (r - mean) * (r - mean), 0) / radii.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev / mean).toBeGreaterThan(0.22);
  });

  it('places some trees outside the immediate facility buffer without crowding the pad', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    const padRadius = Math.max(baseInput.padHalfX, baseInput.padHalfZ);
    const nearPad = placements.filter((p) => {
      const radial = Math.hypot(p.x - baseInput.centerX, p.z - baseInput.centerZ);
      return radial >= padRadius + 8 && radial <= padRadius + 34;
    });
    const huggingPad = placements.filter((p) => {
      const radial = Math.hypot(p.x - baseInput.centerX, p.z - baseInput.centerZ);
      return radial < padRadius + 8;
    });
    expect(nearPad.length).toBeGreaterThanOrEqual(6);
    expect(huggingPad.length).toBeLessThanOrEqual(12);
  });

  it('keeps most trees modest with only occasional landmark-scale trees', () => {
    const placements = computeWoodlandTreePlacements(baseInput);
    const treeScales = placements
      .filter((p) => p.assetId !== 'shrub-round')
      .map((p) => p.scale);
    const average = treeScales.reduce((sum, scale) => sum + scale, 0) / treeScales.length;
    expect(average).toBeLessThan(2.8);
    expect(Math.max(...treeScales)).toBeGreaterThanOrEqual(4.5);
  });
});
