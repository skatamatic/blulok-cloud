import {
  computeUrbanSceneryPlacements,
  urbanSceneryExtentDistance,
} from '@/components/bludesign/core/environment/urbanPlacements';

describe('computeUrbanSceneryPlacements', () => {
  const ringClearanceMultiplier = 1.55;
  const baseInput = {
    centerX: 0,
    centerZ: 0,
    padHalfX: 20,
    padHalfZ: 15,
    fadeStart: 55,
    outerFade: 180,
    facilityHalfX: 18,
    facilityHalfZ: 13,
    environmentSeed: 'facility-test-001',
  };

  it('is deterministic for the same seed', () => {
    const a = computeUrbanSceneryPlacements(baseInput);
    const b = computeUrbanSceneryPlacements(baseInput);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('changes layout when the seed changes', () => {
    const a = computeUrbanSceneryPlacements(baseInput);
    const b = computeUrbanSceneryPlacements({
      ...baseInput,
      environmentSeed: 'facility-test-002',
    });
    expect(a).not.toEqual(b);
  });

  it('includes balanced city blocks without unbounded instance counts', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const buildings = placements.filter((p) => p.kind === 'building');
    const streets = placements.filter((p) => p.kind === 'street');
    const laneLines = placements.filter((p) => p.kind === 'lane-line');

    expect(streets.length).toBeGreaterThanOrEqual(60);
    expect(laneLines.length).toBeGreaterThanOrEqual(70);
    expect(buildings.length).toBeGreaterThanOrEqual(65);
    expect(placements.length).toBeLessThanOrEqual(2600);
  });

  it('adds more buildings when city density is raised', () => {
    const baseline = computeUrbanSceneryPlacements(baseInput).filter((p) => p.kind === 'building')
      .length;
    const dense = computeUrbanSceneryPlacements({ ...baseInput, cityDensity: 1.8 }).filter(
      (p) => p.kind === 'building'
    ).length;
    expect(dense).toBeGreaterThanOrEqual(baseline);
  });

  it('keeps buildings outside the immediate facility buffer', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const buildings = placements.filter((p) => p.kind === 'building');
    expect(buildings.length).toBeGreaterThanOrEqual(20);
    for (const building of buildings) {
      const relX = Math.abs(building.x - baseInput.centerX);
      const relZ = Math.abs(building.z - baseInput.centerZ);
      expect(relX > baseInput.padHalfX + 12 || relZ > baseInput.padHalfZ + 12).toBe(true);
    }
  });

  it('adds a ring road around the facility and clips regular streets outside it', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const streets = placements.filter((p) => p.kind === 'street');
    const ringStreets = streets.filter((p) => p.variant >= 9001 && p.variant <= 9014);
    const regularStreets = streets.filter((p) => p.variant < 9001 || p.variant > 9014);
    const clearX = Math.max(baseInput.padHalfX, baseInput.facilityHalfX) + 10 * ringClearanceMultiplier;
    const clearZ = Math.max(baseInput.padHalfZ, baseInput.facilityHalfZ) + 10 * ringClearanceMultiplier;

    expect(ringStreets.length).toBe(8);
    for (const street of regularStreets) {
      const relX = Math.abs(street.x - baseInput.centerX);
      const relZ = Math.abs(street.z - baseInput.centerZ);
      expect(relX - street.width * 0.5 >= clearX || relZ - street.depth * 0.5 >= clearZ).toBe(true);
    }
  });

  it('emits non-overlapping street surfaces at intersections', () => {
    const streets = computeUrbanSceneryPlacements(baseInput).filter((p) => p.kind === 'street');

    for (let i = 0; i < streets.length; i++) {
      for (let j = i + 1; j < streets.length; j++) {
        const a = streets[i];
        const b = streets[j];
        const overlaps =
          Math.abs(a.x - b.x) < (a.width + b.width) * 0.5 - 0.01 &&
          Math.abs(a.z - b.z) < (a.depth + b.depth) * 0.5 - 0.01;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('keeps city block content outside the ring road clearance', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const clearX = Math.max(baseInput.padHalfX, baseInput.facilityHalfX) + 10 * ringClearanceMultiplier;
    const clearZ = Math.max(baseInput.padHalfZ, baseInput.facilityHalfZ) + 10 * ringClearanceMultiplier;
    const content = placements.filter(
      (p) => p.kind !== 'street' && p.kind !== 'lane-line'
    );

    for (const placement of content) {
      const relX = Math.abs(placement.x - baseInput.centerX);
      const relZ = Math.abs(placement.z - baseInput.centerZ);
      expect(relX - placement.width * 0.5 >= clearX || relZ - placement.depth * 0.5 >= clearZ).toBe(true);
    }
  });

  it('keeps the city tight around the ring road', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const clearX = Math.max(baseInput.padHalfX, baseInput.facilityHalfX) + 10 * ringClearanceMultiplier;
    const clearZ = Math.max(baseInput.padHalfZ, baseInput.facilityHalfZ) + 10 * ringClearanceMultiplier;
    const content = placements.filter(
      (p) => p.kind === 'building' || p.kind === 'park' || p.kind === 'parking-lot'
    );
    const nearestGap = Math.min(
      ...content.map((placement) => {
        const relX = Math.abs(placement.x - baseInput.centerX);
        const relZ = Math.abs(placement.z - baseInput.centerZ);
        const xGap = relX - placement.width * 0.5 - clearX;
        const zGap = relZ - placement.depth * 0.5 - clearZ;
        return Math.max(0, Math.min(xGap >= 0 ? xGap : Infinity, zGap >= 0 ? zGap : Infinity));
      })
    );

    expect(nearestGap).toBeLessThanOrEqual(8);
  });

  it('does not add a landscaped moat around the ring road', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const clearX = Math.max(baseInput.padHalfX, baseInput.facilityHalfX) + 10 * ringClearanceMultiplier;
    const clearZ = Math.max(baseInput.padHalfZ, baseInput.facilityHalfZ) + 10 * ringClearanceMultiplier;
    const parks = placements.filter((p) => p.kind === 'park');
    const moatLikeParks = parks.filter((park) => {
      const relX = Math.abs(park.x - baseInput.centerX);
      const relZ = Math.abs(park.z - baseInput.centerZ);
      const nearXEdge = relX < clearX + 12 && park.depth > clearZ * 1.4;
      const nearZEdge = relZ < clearZ + 12 && park.width > clearX * 1.4;
      return nearXEdge || nearZEdge;
    });

    expect(moatLikeParks.length).toBe(0);
  });

  it('scales buildings larger than storage units and includes a skyline', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const buildings = placements.filter((p) => p.kind === 'building');
    const averageHeight =
      buildings.reduce((sum, building) => sum + building.height, 0) / buildings.length;
    const maxHeight = Math.max(...buildings.map((building) => building.height));
    const maxFootprint = Math.max(...buildings.map((building) => Math.max(building.width, building.depth)));

    expect(averageHeight).toBeGreaterThan(24);
    expect(maxHeight).toBeGreaterThan(60);
    expect(maxFootprint).toBeGreaterThan(20);
  });

  it('includes parks and street trees for urban greenery', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const parks = placements.filter((p) => p.kind === 'park');
    expect(parks.length).toBeGreaterThanOrEqual(3);
    expect(parks.length).toBeLessThanOrEqual(12);
    expect(placements.filter((p) => p.kind === 'urban-tree').length).toBeGreaterThanOrEqual(60);
  });

  it('includes multi-block parks without streets cutting through them', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const parks = placements.filter((p) => p.kind === 'park');
    const streets = placements.filter((p) => p.kind === 'street' || p.kind === 'lane-line');
    const singleBlockParkSize = 58 - 10 * 1.55;

    expect(
      parks.some((park) => park.width > singleBlockParkSize * 1.5 || park.depth > singleBlockParkSize * 1.5)
    ).toBe(true);

    for (const park of parks) {
      for (const street of streets) {
        const overlaps =
          Math.abs(street.x - park.x) < street.width * 0.5 + park.width * 0.5 &&
          Math.abs(street.z - park.z) < street.depth * 0.5 + park.depth * 0.5;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('extends city blocks close to the outer fade band', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const buildings = placements.filter((p) => p.kind === 'building');
    const farthest = Math.max(...buildings.map((p) => Math.hypot(p.x - baseInput.centerX, p.z - baseInput.centerZ)));

    expect(farthest).toBeGreaterThan((baseInput.outerFade ?? 0) * 0.82);
  });

  it('generates an expanded city extent for distance fade', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const farthest = Math.max(
      ...placements.map((p) => Math.hypot(p.x - baseInput.centerX, p.z - baseInput.centerZ))
    );
    const extentDistance = urbanSceneryExtentDistance(baseInput);

    expect(extentDistance).toBeGreaterThan((baseInput.outerFade ?? 0) * 1.6);
    expect(farthest).toBeGreaterThan((baseInput.outerFade ?? 0) * 1.15);
    expect(farthest).toBeLessThanOrEqual(extentDistance * 1.45);
  });

  it('places streetlights along street curbs instead of block centers', () => {
    const placements = computeUrbanSceneryPlacements(baseInput);
    const lights = placements.filter((p) => p.kind === 'streetlight');
    const sw = 10;
    const bs = 58;
    const curbOffset = sw * 0.5 + 0.85;

    expect(lights.length).toBeGreaterThanOrEqual(24);

    for (const light of lights) {
      const relX = Math.abs(light.x - baseInput.centerX);
      const relZ = Math.abs(light.z - baseInput.centerZ);
      const xMod = relX % bs;
      const zMod = relZ % bs;
      const nearHorizontalCurb =
        Math.abs(zMod - bs * 0.5) > bs * 0.5 - curbOffset - 1.2 &&
        Math.abs(zMod - bs * 0.5) < bs * 0.5 + curbOffset + 1.2;
      const nearVerticalCurb =
        Math.abs(xMod - bs * 0.5) > bs * 0.5 - curbOffset - 1.2 &&
        Math.abs(xMod - bs * 0.5) < bs * 0.5 + curbOffset + 1.2;
      expect(nearHorizontalCurb || nearVerticalCurb).toBe(true);
    }
  });

  it('fills beyond the ends of a long facility instead of only the side bands', () => {
    const longFacilityInput = {
      ...baseInput,
      padHalfX: 150,
      padHalfZ: 18,
      facilityHalfX: 142,
      facilityHalfZ: 15,
      outerFade: 360,
    };
    const buildings = computeUrbanSceneryPlacements(longFacilityInput).filter(
      (p) => p.kind === 'building'
    );
    const beyondPositiveEnd = buildings.filter(
      (p) => p.x - longFacilityInput.centerX > longFacilityInput.padHalfX + 22
    );
    const beyondNegativeEnd = buildings.filter(
      (p) => longFacilityInput.centerX - p.x > longFacilityInput.padHalfX + 22
    );

    expect(buildings.length).toBeGreaterThanOrEqual(160);
    expect(beyondPositiveEnd.length).toBeGreaterThanOrEqual(12);
    expect(beyondNegativeEnd.length).toBeGreaterThanOrEqual(12);
  });
});
