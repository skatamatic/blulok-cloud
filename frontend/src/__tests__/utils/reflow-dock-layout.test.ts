import {
  layoutWithFlexibleDocks,
  layoutItemFromSize,
  validateLayout,
  GRID_ROWS,
  WidgetLayoutInstance,
  dockMinPlacement,
  buildDragPreviewLg,
  validateProposedFreeLayout,
  computeLiveDockRects,
  computeLiveDockGesture,
  liveGridGestureSig,
} from '@/utils/dashboard-layout-engine';

describe('layoutWithFlexibleDocks', () => {
  const facilityDock: WidgetLayoutInstance = {
    id: 'facility-viewer',
    type: 'facility-viewer',
    size: 'dock-full',
  };

  it('shrinks dock-full when a widget occupies the top-left corner', () => {
    const nonDock = [{ i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(nonDock, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    const dock = result.find((i) => i.i === 'facility-viewer');
    expect(dock).toMatchObject({ x: 3, y: 0, w: 9, h: 6 });
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-full below a widget placed along the top edge', () => {
    const nonDock = [{ i: 'stats-facilities', x: 3, y: 0, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(nonDock, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    const dock = result.find((i) => i.i === 'facility-viewer');
    expect(dock).toMatchObject({ x: 0, y: 2, w: 12, h: 4 });
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-full when a widget is placed on the left', () => {
    const nonDock = [{ i: 'stats-facilities', x: 0, y: 2, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(nonDock, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    const dock = result.find((i) => i.i === 'facility-viewer');
    expect(dock).toMatchObject({ x: 3, y: 0, w: 9, h: 6 });
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-full when a widget is placed on the right', () => {
    const nonDock = [{ i: 'stats-facilities', x: 9, y: 2, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(nonDock, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    const dock = result.find((i) => i.i === 'facility-viewer');
    expect(dock).toMatchObject({ x: 0, y: 0, w: 9, h: 6 });
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-full when a widget is placed on the bottom', () => {
    const nonDock = [{ i: 'stats-facilities', x: 3, y: 4, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(nonDock, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    const dock = result.find((i) => i.i === 'facility-viewer');
    expect(dock).toMatchObject({ x: 0, y: 0, w: 12, h: 4 });
    expect(validateLayout(result).valid).toBe(true);
  });

  it('allows dock-full at max size when page is empty aside from dock', () => {
    const result = layoutWithFlexibleDocks([], [facilityDock]);
    expect(result[0]).toMatchObject({ x: 0, y: 0, w: 12, h: 6 });
  });

  it('shrinks dock-bottom and keeps dragged widget above the dock', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'units-manager', type: 'units-manager', size: 'dock-bottom' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
      { id: 'notifications', type: 'notifications', size: 'medium' },
    ];
    const draggedIntoDock = [
      { i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 },
      { i: 'notifications', x: 3, y: 5, w: 3, h: 2 },
    ];

    const result = layoutWithFlexibleDocks(draggedIntoDock, instances);
    expect(validateLayout(result).valid).toBe(true);

    const dock = result.find((i) => i.i === 'units-manager')!;
    expect(dock.y + dock.h).toBe(GRID_ROWS);
    expect(dock.y).toBeGreaterThan(0);

    const notif = result.find((i) => i.i === 'notifications')!;
    expect(notif.y + notif.h).toBeLessThanOrEqual(GRID_ROWS);
    expect(notif.y + notif.h).toBeLessThanOrEqual(dock.y);
  });

  it('preserves intentional non-dock positions when they do not overlap dock', () => {
    const dragged = [{ i: 'stats-facilities', x: 9, y: 0, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, [
      facilityDock,
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ]);

    expect(result.find((i) => i.i === 'stats-facilities')).toMatchObject(dragged[0]);
  });

  it('lets a widget drag down to y=2 above a dock-bottom by shrinking the dock', () => {
    // Regression: previously a non-dock medium (h=2) widget was clamped to y=1
    // because dock-bottom had default y=3, h=3 and refused to shrink.
    const instances: WidgetLayoutInstance[] = [
      { id: 'units-manager', type: 'units-manager', size: 'dock-bottom' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [{ i: 'stats-facilities', x: 0, y: 2, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, instances);

    const stats = result.find((i) => i.i === 'stats-facilities')!;
    const dock = result.find((i) => i.i === 'units-manager')!;
    expect(stats).toMatchObject({ x: 0, y: 2, w: 3, h: 2 });
    expect(dock.y + dock.h).toBe(GRID_ROWS);
    expect(dock.y).toBeGreaterThanOrEqual(4);
    expect(validateLayout(result).valid).toBe(true);
  });

  it('never positions a widget off-screen when it overlaps a dock-bottom at min size', () => {
    // Even when the dragged widget is too tall for the dock to fully shrink,
    // we push it up rather than letting it spill below maxRows.
    const instances: WidgetLayoutInstance[] = [
      { id: 'units-manager', type: 'units-manager', size: 'dock-bottom' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [{ i: 'stats-facilities', x: 0, y: 5, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, instances);

    const stats = result.find((i) => i.i === 'stats-facilities')!;
    expect(stats.y + stats.h).toBeLessThanOrEqual(GRID_ROWS);
    expect(stats.x + stats.w).toBeLessThanOrEqual(12);
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-left horizontally to accommodate a widget dragged into its column range', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'facility-viewer', type: 'facility-viewer', size: 'dock-left' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [{ i: 'stats-facilities', x: 4, y: 0, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, instances);

    const stats = result.find((i) => i.i === 'stats-facilities')!;
    const dock = result.find((i) => i.i === 'facility-viewer')!;
    expect(stats).toMatchObject({ x: 4, y: 0, w: 3, h: 2 });
    expect(dock.x).toBe(0);
    expect(dock.x + dock.w).toBeLessThanOrEqual(4);
    expect(validateLayout(result).valid).toBe(true);
  });

  it('shrinks dock-top vertically when a widget is dragged into the top region', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'facility-viewer', type: 'facility-viewer', size: 'dock-top' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [{ i: 'stats-facilities', x: 0, y: 1, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, instances);

    const stats = result.find((i) => i.i === 'stats-facilities')!;
    const dock = result.find((i) => i.i === 'facility-viewer')!;
    expect(stats).toMatchObject({ x: 0, y: 1, w: 3, h: 2 });
    expect(dock.y).toBe(0);
    expect(dock.h).toBeLessThanOrEqual(1);
    expect(validateLayout(result).valid).toBe(true);
  });

  it('returns to default dock geometry when free widgets are not intruding', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'units-manager', type: 'units-manager', size: 'dock-bottom' },
      { id: 'stats-facilities', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [{ i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 }];
    const result = layoutWithFlexibleDocks(dragged, instances);

    const dock = result.find((i) => i.i === 'units-manager')!;
    // dock-bottom default = (0, 3, 12, 3); widget rows 0-1, no intrusion
    expect(dock).toMatchObject({ x: 0, y: 3, w: 12, h: 3 });
  });

  it('keeps free widgets in their original positions when far from any dock', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'units-manager', type: 'units-manager', size: 'dock-bottom' },
      { id: 'stats-a', type: 'stats-facilities', size: 'medium' },
      { id: 'stats-b', type: 'stats-facilities', size: 'medium' },
      { id: 'stats-c', type: 'stats-facilities', size: 'medium' },
    ];
    const dragged = [
      { i: 'stats-a', x: 0, y: 0, w: 3, h: 2 },
      { i: 'stats-b', x: 3, y: 0, w: 3, h: 2 },
      { i: 'stats-c', x: 6, y: 0, w: 3, h: 2 },
    ];
    const result = layoutWithFlexibleDocks(dragged, instances);

    expect(result.find((i) => i.i === 'stats-a')).toMatchObject({ x: 0, y: 0 });
    expect(result.find((i) => i.i === 'stats-b')).toMatchObject({ x: 3, y: 0 });
    expect(result.find((i) => i.i === 'stats-c')).toMatchObject({ x: 6, y: 0 });
    expect(validateLayout(result).valid).toBe(true);
  });
});

describe('layoutWithFlexibleDocks — used as proxy for layoutItemFromSize', () => {
  it('exports layoutItemFromSize for tests that build dock items', () => {
    expect(layoutItemFromSize('w', 'dock-bottom')).toMatchObject({
      x: 0,
      y: 3,
      w: 12,
      h: 3,
    });
  });
});

describe('dockMinPlacement', () => {
  it('shrinks dock-bottom to a 1-row strip at the bottom', () => {
    expect(dockMinPlacement('dock-bottom')).toMatchObject({
      x: 0,
      y: GRID_ROWS - 1,
      w: 12,
      h: 1,
    });
  });

  it('shrinks dock-top to a 1-row strip at the top', () => {
    expect(dockMinPlacement('dock-top')).toMatchObject({
      x: 0,
      y: 0,
      w: 12,
      h: 1,
    });
  });

  it('shrinks dock-bottom-two-thirds to its 2-row minimum at the bottom', () => {
    expect(dockMinPlacement('dock-bottom-two-thirds')).toMatchObject({
      x: 0,
      y: GRID_ROWS - 2,
      w: 12,
      h: 2,
    });
  });

  it('shrinks dock-left to its minimum width on the left', () => {
    expect(dockMinPlacement('dock-left')).toMatchObject({
      x: 0,
      y: 0,
      w: 3,
      h: GRID_ROWS,
    });
  });

  it('shrinks dock-right to its minimum width on the right', () => {
    expect(dockMinPlacement('dock-right')).toMatchObject({
      x: 12 - 3,
      y: 0,
      w: 3,
      h: GRID_ROWS,
    });
  });

  it('shrinks dock-full to a centered minimum rect', () => {
    expect(dockMinPlacement('dock-full')).toMatchObject({
      x: Math.floor((12 - 3) / 2),
      y: Math.floor((GRID_ROWS - 2) / 2),
      w: 3,
      h: 2,
    });
  });
});

describe('buildDragPreviewLg', () => {
  it('replaces dock items with their min rect while leaving free items untouched', () => {
    const lg = [
      { i: 'units-manager', x: 0, y: 3, w: 12, h: 3 },
      { i: 'stats', x: 0, y: 0, w: 3, h: 2 },
    ];
    const instances = [
      { id: 'units-manager', size: 'dock-bottom' as const },
      { id: 'stats', size: 'medium' as const },
    ];

    const preview = buildDragPreviewLg(lg, instances);
    const dock = preview.find((i) => i.i === 'units-manager')!;
    const stats = preview.find((i) => i.i === 'stats')!;

    expect(dock).toMatchObject({ x: 0, y: GRID_ROWS - 1, w: 12, h: 1 });
    expect(stats).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });
  });

  it('is a no-op when there are no docks', () => {
    const lg = [{ i: 'stats', x: 0, y: 0, w: 3, h: 2 }];
    const instances = [{ id: 'stats', size: 'medium' as const }];
    expect(buildDragPreviewLg(lg, instances)).toEqual(lg);
  });
});

describe('validateProposedFreeLayout', () => {
  const instances: WidgetLayoutInstance[] = [
    { id: 'stats', type: 'stats-facilities', size: 'medium' },
    { id: 'notif', type: 'notifications', size: 'medium' },
  ];

  it('accepts a placement that does not overlap any other free widget', () => {
    const proposed = [
      { i: 'stats', x: 0, y: 0, w: 3, h: 2 },
      { i: 'notif', x: 3, y: 0, w: 3, h: 2 },
    ];
    const result = validateProposedFreeLayout(proposed, instances);
    expect(result.accepted).toBe(true);
  });

  it('rejects when a free widget would overlap another free widget', () => {
    const proposed = [
      { i: 'stats', x: 0, y: 0, w: 3, h: 2 },
      { i: 'notif', x: 1, y: 0, w: 3, h: 2 }, // overlaps stats
    ];
    const result = validateProposedFreeLayout(proposed, instances);
    expect(result.accepted).toBe(false);
  });

  it('accepts when a free widget enters a dock-full and the dock can shrink', () => {
    const dockInstances: WidgetLayoutInstance[] = [
      { id: 'viewer', type: 'facility-viewer', size: 'dock-full' },
      { id: 'stats', type: 'stats-facilities', size: 'medium' },
    ];
    const proposed = [{ i: 'stats', x: 0, y: 0, w: 3, h: 2 }];
    const result = validateProposedFreeLayout(proposed, dockInstances);
    expect(result.accepted).toBe(true);
    const dock = result.reflowed.find((i) => i.i === 'viewer');
    expect(dock).toMatchObject({ x: 3, y: 0, w: 9, h: 6 });
  });

  it('rejects when a free widget cannot fit even with the dock at its min size', () => {
    const dockInstances: WidgetLayoutInstance[] = [
      { id: 'viewer', type: 'facility-viewer', size: 'dock-full' },
      { id: 'big', type: 'units-manager', size: 'huge' },
    ];
    // dock-full's min rect is 3x2 centered; place a 12x6 widget which
    // can't coexist anywhere — reflow has to push it, so we reject.
    const proposed = [{ i: 'big', x: 0, y: 0, w: 12, h: 6 }];
    const result = validateProposedFreeLayout(proposed, dockInstances);
    expect(result.accepted).toBe(false);
  });
});

describe('computeLiveDockRects', () => {
  it('reports the dock geometry for the current free-widget configuration', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'viewer', type: 'facility-viewer', size: 'dock-full' },
      { id: 'stats', type: 'stats-facilities', size: 'medium' },
    ];
    const free = [{ i: 'stats', x: 0, y: 5, w: 3, h: 2 }];
    const live = { i: 'stats', x: 3, y: 0, w: 3, h: 2 };
    const rects = computeLiveDockRects(free, live, instances);
    const dock = rects.get('viewer');
    expect(dock).toMatchObject({ x: 0, y: 2, w: 12, h: 4 });
  });

  it('returns an empty map when no docks exist', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'stats', type: 'stats-facilities', size: 'medium' },
    ];
    const live = { i: 'stats', x: 0, y: 0, w: 3, h: 2 };
    const rects = computeLiveDockRects([], live, instances);
    expect(rects.size).toBe(0);
  });
});

describe('computeLiveDockGesture', () => {
  it('returns dock rects and acceptance in one pass', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'viewer', type: 'facility-viewer', size: 'dock-full' },
      { id: 'stats', type: 'stats-facilities', size: 'medium' },
    ];
    const free = [{ i: 'stats', x: 0, y: 5, w: 3, h: 2 }];
    const live = { i: 'stats', x: 3, y: 0, w: 3, h: 2 };
    const { rects, accepted } = computeLiveDockGesture(free, live, instances);
    expect(accepted).toBe(true);
    expect(rects.get('viewer')).toMatchObject({ x: 0, y: 2, w: 12, h: 4 });
  });

  it('marks overlapping free widgets as rejected', () => {
    const instances: WidgetLayoutInstance[] = [
      { id: 'viewer', type: 'facility-viewer', size: 'dock-full' },
      { id: 'a', type: 'stats-facilities', size: 'medium' },
      { id: 'b', type: 'stats-devices', size: 'medium' },
    ];
    const free = [
      { i: 'a', x: 0, y: 0, w: 3, h: 2 },
      { i: 'b', x: 1, y: 0, w: 3, h: 2 },
    ];
    const live = { i: 'a', x: 0, y: 0, w: 3, h: 2 };
    const { accepted } = computeLiveDockGesture(free, live, instances);
    expect(accepted).toBe(false);
  });
});

describe('liveGridGestureSig', () => {
  it('changes only when snapped grid cell geometry changes', () => {
    expect(liveGridGestureSig({ x: 1, y: 2, w: 3, h: 2 })).toBe('1,2,3x2');
    expect(liveGridGestureSig({ x: 1, y: 2, w: 3, h: 2 })).toBe(
      liveGridGestureSig({ x: 1, y: 2, w: 3, h: 2 })
    );
  });
});
