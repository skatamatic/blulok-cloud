import {
  applyPreviewResizeTiersIfChanged,
  applyWidgetSizeToPage,
  applyLayoutsToPage,
  pageFromApiWidgets,
  pagesToSavePayload,
  roundTripPageLayout,
} from '@/utils/dashboard-persistence.utils';
import { DashboardPageState } from '@/types/widget-management.types';
import {
  GridLayoutItem,
  isDockSize,
  layoutItemFromSize,
} from '@/utils/dashboard-layout-engine';
import { syncPageWithClampedLayout } from '@/utils/dashboard-state.utils';

describe('applyPreviewResizeTiersIfChanged', () => {
  const basePage: DashboardPageState = {
    id: 'p1',
    name: 'Main',
    pageOrder: 0,
    widgetInstances: [
      {
        id: 'stats-facilities',
        type: 'stats-facilities',
        title: 'Facilities',
        size: 'medium',
      },
    ],
    layouts: { lg: [], md: [], sm: [] },
  };

  it('returns null when snapped tier is unchanged', () => {
    const result = applyPreviewResizeTiersIfChanged(basePage, {
      lg: [{ i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 }],
    });
    expect(result).toBeNull();
  });

  it('returns updated page when tier crosses a threshold', () => {
    const result = applyPreviewResizeTiersIfChanged(basePage, {
      lg: [{ i: 'stats-facilities', x: 0, y: 0, w: 1, h: 1 }],
    });
    expect(result).not.toBeNull();
    expect(result!.widgetInstances[0].size).toBe('tiny');
    expect(result!.layouts).toBe(basePage.layouts);
  });
});

describe('applyWidgetSizeToPage – undock preserves grid size', () => {
  function unitsManagerDockBottomPage(): DashboardPageState {
    return {
      id: 'p1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'units-manager',
          type: 'units-manager',
          title: 'Units',
          size: 'dock-bottom',
        },
      ],
      layouts: {
        lg: [layoutItemFromSize('units-manager', 'dock-bottom')],
        md: [],
        sm: [],
      },
    };
  }

  it('undocking a 12×3 dock keeps grid dimensions and maps to large-wide content tier', () => {
    const start = unitsManagerDockBottomPage();
    const result = applyWidgetSizeToPage(start, 'units-manager', 'large');
    expect(result).not.toBeNull();
    expect(result!.widgetInstances[0].size).toBe('large-wide');
    expect(isDockSize(result!.widgetInstances[0].size)).toBe(false);
    expect(result!.layouts.lg[0]).toMatchObject({ w: 12, h: 3 });
  });

  it('undocking preserves flex-shrunk dock geometry', () => {
    const start = unitsManagerDockBottomPage();
    start.layouts.lg = [{ i: 'units-manager', x: 0, y: 2, w: 12, h: 2 }];
    const result = applyWidgetSizeToPage(start, 'units-manager', 'medium');
    expect(result).not.toBeNull();
    expect(result!.layouts.lg[0]).toMatchObject({ w: 12, h: 2 });
    expect(isDockSize(result!.widgetInstances[0].size)).toBe(false);
  });

  it('docking back to "dock-bottom" still works after the fix', () => {
    const start: DashboardPageState = {
      id: 'p1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'units-manager',
          type: 'units-manager',
          title: 'Units',
          size: 'large',
        },
      ],
      layouts: {
        lg: [{ i: 'units-manager', x: 0, y: 0, w: 4, h: 3 }],
        md: [],
        sm: [],
      },
    };
    const result = applyWidgetSizeToPage(start, 'units-manager', 'dock-bottom');
    expect(result).not.toBeNull();
    expect(result!.widgetInstances[0].size).toBe('dock-bottom');
    expect(isDockSize(result!.widgetInstances[0].size)).toBe(true);
    expect(result!.layouts.lg[0]).toMatchObject({
      x: 0,
      y: 3,
      w: 12,
      h: 3,
    });
  });
});

function expectStableRoundTrip(page: DashboardPageState) {
  const [saved] = pagesToSavePayload([page]);
  for (const widget of saved.widgets) {
    const inst = page.widgetInstances.find((w) => w.id === widget.widgetId);
    const lg = (page.layouts.lg as GridLayoutItem[]).find((i) => i.i === widget.widgetId)!;
    expect(widget.layoutConfig.position).toMatchObject({
      x: lg.x,
      y: lg.y,
      w: lg.w,
      h: lg.h,
    });
  }

  const reloaded = roundTripPageLayout(page);
  for (const inst of page.widgetInstances) {
    const reloadedInst = reloaded.widgetInstances.find((w) => w.id === inst.id);
    expect(reloadedInst?.size).toBe(inst.size);

    const orig = (page.layouts.lg as GridLayoutItem[]).find((i) => i.i === inst.id)!;
    const next = (reloaded.layouts.lg as GridLayoutItem[]).find((i) => i.i === inst.id)!;
    expect(next).toMatchObject({
      x: orig.x,
      y: orig.y,
      w: orig.w,
      h: orig.h,
    });
  }
}

describe('dashboard layout persistence round-trip', () => {
  it('reload keeps persisted grid cells even when size label disagrees', () => {
    const { page } = pageFromApiWidgets('p1', 'Main', 0, [
      {
        widgetId: 'notifications',
        widgetType: 'notifications',
        layoutConfig: {
          size: 'medium-tall',
          position: { x: 0, y: 0, w: 3, h: 2 },
        },
      },
    ]);

    expect(page.layouts.lg[0]).toMatchObject({ w: 3, h: 2 });
    expect(page.widgetInstances[0].size).toBe('medium');
  });

  it('system-notifications keeps arbitrary width after reload', () => {
    const { page } = pageFromApiWidgets('p1', 'Main', 0, [
      {
        widgetId: 'system-notifications',
        widgetType: 'notifications',
        layoutConfig: {
          size: 'large',
          position: { x: 0, y: 1, w: 5, h: 3 },
        },
      },
    ]);

    expect(page.layouts.lg[0]).toMatchObject({ w: 5, h: 3 });
    expect(page.widgetInstances[0].size).toBe('large');
  });

  it('syncPageWithClampedLayout derives content tier from grid cells', () => {
    const page: DashboardPageState = {
      id: 'p1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'notifications',
          type: 'notifications',
          title: 'Notifications',
          size: 'medium-tall',
        },
      ],
      layouts: { lg: [], md: [], sm: [] },
    };

    const { page: synced } = syncPageWithClampedLayout(
      page,
      [{ i: 'notifications', x: 0, y: 0, w: 3, h: 2 }]
    );
    expect(synced.widgetInstances[0].size).toBe('medium');
    expect(synced.layouts.lg[0]).toMatchObject({ w: 3, h: 2 });
  });

  it('round-trips mixed dock + standard widgets without size or geometry drift', () => {
    const page = applyLayoutsToPage(
      {
        id: 'p1',
        name: 'Main',
        pageOrder: 0,
        widgetInstances: [
          {
            id: 'units-manager',
            type: 'units-manager',
            title: 'Units',
            size: 'dock-bottom',
          },
          {
            id: 'notifications',
            type: 'notifications',
            title: 'Notifications',
            size: 'medium-tall',
          },
          {
            id: 'sync-fms',
            type: 'sync-fms',
            title: 'FMS Sync',
            size: 'tiny',
          },
          {
            id: 'stats-facilities',
            type: 'stats-facilities',
            title: 'Facilities',
            size: 'medium',
          },
        ],
        layouts: { lg: [], md: [], sm: [] },
      },
      {
        lg: [
          { i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 },
          { i: 'sync-fms', x: 3, y: 0, w: 1, h: 1 },
          { i: 'notifications', x: 4, y: 0, w: 3, h: 3 },
          layoutItemFromSize('units-manager', 'dock-bottom'),
        ],
      }
    );

    expectStableRoundTrip(page);
  });

  it('round-trips dock-full with neighbouring widgets', () => {
    const page = applyLayoutsToPage(
      {
        id: 'p1',
        name: 'Main',
        pageOrder: 0,
        widgetInstances: [
          {
            id: 'facility-viewer',
            type: 'facility-viewer',
            title: 'Facility',
            size: 'dock-full',
          },
          {
            id: 'stats-facilities',
            type: 'stats-facilities',
            title: 'Facilities',
            size: 'medium',
          },
        ],
        layouts: { lg: [], md: [], sm: [] },
      },
      {
        lg: [
          { i: 'stats-facilities', x: 3, y: 0, w: 3, h: 2 },
          layoutItemFromSize('facility-viewer', 'dock-full'),
        ],
      }
    );

    expectStableRoundTrip(page);
    expect(page.widgetInstances.find((w) => w.id === 'facility-viewer')?.size).toBe(
      'dock-full'
    );
  });

  it('round-trips free-form resize dimensions', () => {
    const page = applyLayoutsToPage(
      {
        id: 'p1',
        name: 'Main',
        pageOrder: 0,
        widgetInstances: [
          {
            id: 'sync-fms',
            type: 'sync-fms',
            title: 'FMS Sync',
            size: 'large-wide',
          },
        ],
        layouts: { lg: [], md: [], sm: [] },
      },
      {
        lg: [{ i: 'sync-fms', x: 0, y: 0, w: 5, h: 3 }],
      }
    );

    expectStableRoundTrip(page);
    expect(page.layouts.lg[0]).toMatchObject({ w: 5, h: 3 });
  });

  it('dock-shaped grid dimensions do not auto-dock units-manager', () => {
    const page = applyLayoutsToPage(
      {
        id: 'p1',
        name: 'Main',
        pageOrder: 0,
        widgetInstances: [
          {
            id: 'units-manager',
            type: 'units-manager',
            title: 'Units',
            size: 'large-wide',
          },
        ],
        layouts: { lg: [], md: [], sm: [] },
      },
      {
        lg: [{ i: 'units-manager', x: 0, y: 0, w: 12, h: 3 }],
      }
    );

    expect(isDockSize(page.widgetInstances[0].size)).toBe(false);
    expect(page.layouts.lg[0]).toMatchObject({ w: 12, h: 3 });

    const reloaded = roundTripPageLayout(page);
    expect(isDockSize(reloaded.widgetInstances[0].size)).toBe(false);
    expect(reloaded.layouts.lg[0]).toMatchObject({ w: 12, h: 3 });
  });
});
