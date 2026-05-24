import {
  GRID_ROWS,
  GRID_COLS,
  validateLayout,
  findPlacement,
  clampLayout,
  dockPlacement,
  layoutItemFromSize,
  WIDGET_SIZE_ENUM,
} from '@/utils/dashboard-layout-engine';

describe('dashboard-layout-engine', () => {
  it('validates non-overlapping layouts within grid bounds', () => {
    const items = [
      { i: 'a', x: 0, y: 0, w: 3, h: 2 },
      { i: 'b', x: 3, y: 0, w: 3, h: 2 },
    ];
    expect(validateLayout(items).valid).toBe(true);
  });

  it('rejects layouts that exceed GRID_ROWS', () => {
    const items = [{ i: 'a', x: 0, y: 0, w: 12, h: GRID_ROWS + 1 }];
    expect(validateLayout(items).valid).toBe(false);
  });

  it('rejects overlapping widgets', () => {
    const items = [
      { i: 'a', x: 0, y: 0, w: 4, h: 3 },
      { i: 'b', x: 2, y: 1, w: 4, h: 3 },
    ];
    expect(validateLayout(items).valid).toBe(false);
  });

  it('places dock-top at canonical coordinates', () => {
    const dock = dockPlacement('dock-top');
    expect(dock).toMatchObject({ x: 0, y: 0, w: 12, h: 3 });
  });

  it('findPlacement returns slot for tiny widget on empty grid', () => {
    const placement = findPlacement([], 'tiny');
    expect(placement).toEqual({ i: '__placement__', x: 0, y: 0, w: 1, h: 1 });
  });

  it('clampLayout fits overflowing legacy layout into grid', () => {
    const legacy = [{ i: 'w1', x: 0, y: 0, w: 3, h: 8 }];
    const clamped = clampLayout(legacy);
    expect(clamped.length).toBeGreaterThan(0);
    expect(clamped[0].y + clamped[0].h).toBeLessThanOrEqual(GRID_ROWS);
  });

  it('layoutItemFromSize applies dock position', () => {
    const item = layoutItemFromSize('viewer', 'dock-right');
    expect(item).toMatchObject({ i: 'viewer', x: 6, y: 0, w: 6, h: GRID_ROWS });
  });

  it('WIDGET_SIZE_ENUM includes dock-full for API validation', () => {
    expect(WIDGET_SIZE_ENUM).toContain('dock-full');
  });
});
