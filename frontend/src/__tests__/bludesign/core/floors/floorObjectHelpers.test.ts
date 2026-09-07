import {
  generatePlacementObjectId,
  adjustDisplayNameForFloor,
} from '../../../../components/bludesign/core/floors/floorObjectHelpers';

describe('floorObjectHelpers', () => {
  it('adjustDisplayNameForFloor updates (F#) suffix', () => {
    expect(adjustDisplayNameForFloor('Unit (F2)', 4)).toBe('Unit (F4)');
  });

  it('adjustDisplayNameForFloor supports negative floor index in suffix', () => {
    expect(adjustDisplayNameForFloor('Shaft (F-1)', 0)).toBe('Shaft (F0)');
  });

  it('adjustDisplayNameForFloor leaves name unchanged when no suffix', () => {
    expect(adjustDisplayNameForFloor('Lobby', 3)).toBe('Lobby');
  });

  it('adjustDisplayNameForFloor returns undefined when name is undefined', () => {
    expect(adjustDisplayNameForFloor(undefined, 2)).toBeUndefined();
  });

  it('generatePlacementObjectId returns unique strings', () => {
    const a = generatePlacementObjectId();
    const b = generatePlacementObjectId();
    expect(a).toMatch(/^asset-/);
    expect(a).not.toBe(b);
  });
});
