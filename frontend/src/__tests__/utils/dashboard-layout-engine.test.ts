import {
  GRID_ROWS,
  validateLayout,
  findPlacement,
  findPlacementWithFallback,
  clampLayout,
  buildDefaultStaffLayouts,
} from '@/utils/dashboard-layout-engine';

describe('dashboard-layout-engine (frontend)', () => {
  it('default staff layout fits within GRID_ROWS', () => {
    const { lg } = buildDefaultStaffLayouts();
    const result = validateLayout(lg);
    expect(result.valid).toBe(true);
    for (const item of lg) {
      expect(item.y + item.h).toBeLessThanOrEqual(GRID_ROWS);
    }
  });

  it('findPlacement fails when grid is full', () => {
    const full = [{ i: 'dock', x: 0, y: 0, w: 12, h: GRID_ROWS }];
    expect(findPlacement(full, 'medium')).toBeNull();
  });

  it('findPlacementWithFallback uses a smaller size when preferred does not fit', () => {
    const nearlyFull = [
      { i: 'a', x: 0, y: 0, w: 12, h: 5 },
      { i: 'b', x: 0, y: 5, w: 10, h: 1 },
    ];
    expect(findPlacement(nearlyFull, 'medium')).toBeNull();
    const fit = findPlacementWithFallback(nearlyFull, 'medium', [
      'tiny',
      'small',
      'medium',
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.size).toBe('tiny');
  });

  it('clampLayout removes items that cannot be placed', () => {
    const overflow = [
      { i: 'a', x: 0, y: 0, w: 12, h: 6 },
      { i: 'b', x: 0, y: 0, w: 12, h: 6 },
    ];
    const clamped = clampLayout(overflow);
    expect(clamped.length).toBeLessThanOrEqual(1);
  });
});
