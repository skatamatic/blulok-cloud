import { computeLocalTerrainFadeRadii } from '@/components/bludesign/core/environment/localTerrainGround';

describe('computeLocalTerrainFadeRadii', () => {
  const base = {
    maxHalf: 40,
    maxDim: 80,
    terrainRadius: 500,
  };

  it('uses default outskirts fade at scale 1', () => {
    const { fadeStart, fadeEnd } = computeLocalTerrainFadeRadii({
      ...base,
      fadeStartScale: 1,
      fadeEndScale: 1,
    });
    expect(fadeStart).toBeGreaterThan(base.maxHalf);
    expect(fadeEnd).toBeGreaterThan(fadeStart);
  });

  it('allows fade to begin at facility center when start scale is 0', () => {
    const { fadeStart } = computeLocalTerrainFadeRadii({
      ...base,
      fadeStartScale: 0,
      fadeEndScale: 1,
    });
    expect(fadeStart).toBe(0);
  });

  it('tightens outer fade when end scale is 0', () => {
    const { fadeStart, fadeEnd } = computeLocalTerrainFadeRadii({
      ...base,
      fadeStartScale: 0,
      fadeEndScale: 0,
    });
    expect(fadeStart).toBe(0);
    expect(fadeEnd).toBeCloseTo(0.25, 5);
  });
});
