/**
 * Dock-full persistence with flexible reflow (shared page with other widgets).
 */
import { layoutItemFromSize } from '@/utils/dashboard-layout-engine';
import { DashboardPageState } from '@/types/widget-management.types';
import {
  applyWidgetSizeToPage,
  applyLayoutsToPage,
  pagesToSavePayload,
  pageFromApiWidgets,
  resolveLoadedWidgetSize,
} from '@/utils/dashboard-persistence.utils';
import { validateLayout } from '@/utils/dashboard-layout-engine';

function facilityViewerPage(size: 'dock-left' | 'dock-full'): DashboardPageState {
  return {
    id: 'page-1',
    name: 'Main',
    pageOrder: 0,
    widgetInstances: [
      {
        id: 'facility-viewer',
        type: 'facility-viewer',
        title: 'Facility 3D View',
        size,
      },
    ],
    layouts: {
      lg: [layoutItemFromSize('facility-viewer', size)],
      md: [],
      sm: [],
    },
  };
}

describe('dock-full flexible docking', () => {
  it('apply → save payload → reload preserves dock-full semantic size', () => {
    const start = facilityViewerPage('dock-left');
    const applied = applyWidgetSizeToPage(start, 'facility-viewer', 'dock-full');
    expect(applied).not.toBeNull();
    expect(applied!.widgetInstances[0].size).toBe('dock-full');
    expect(applied!.layouts.lg[0]).toMatchObject({ w: 12, h: 6 });

    const [savedPage] = pagesToSavePayload([applied!]);
    expect(savedPage.widgets[0].layoutConfig.size).toBe('dock-full');

    const { page: reloaded } = pageFromApiWidgets(
      'page-1',
      'Main',
      0,
      savedPage.widgets
    );
    expect(reloaded.widgetInstances[0].size).toBe('dock-full');
  });

  it('dock-full shrinks when a widget is placed on top', () => {
    const dockFull = applyWidgetSizeToPage(
      facilityViewerPage('dock-left'),
      'facility-viewer',
      'dock-full'
    )!;

    const pageWithBoth: DashboardPageState = {
      ...dockFull,
      widgetInstances: [
        ...dockFull.widgetInstances,
        {
          id: 'stats-facilities',
          type: 'stats-facilities',
          title: 'Facilities',
          size: 'medium',
        },
      ],
    };

    const withTopWidget = applyLayoutsToPage(pageWithBoth, {
      lg: [
        { i: 'stats-facilities', x: 3, y: 0, w: 3, h: 2 },
        { i: 'facility-viewer', x: 0, y: 0, w: 12, h: 6 },
      ],
    });

    expect(withTopWidget.widgetInstances).toHaveLength(2);
    const dockItem = withTopWidget.layouts.lg.find((i) => i.i === 'facility-viewer');
    expect(dockItem).toMatchObject({ x: 0, y: 2, w: 12, h: 4 });

    const [savedPage] = pagesToSavePayload([withTopWidget]);
    expect(savedPage.widgets).toHaveLength(2);
  });

  it('resolveLoadedWidgetSize keeps dock-full label for shrunk geometry', () => {
    expect(
      resolveLoadedWidgetSize('facility-viewer', {
        size: 'dock-full',
        position: { x: 0, y: 2, w: 12, h: 4 },
      })
    ).toBe('dock-full');
  });

  it('pagesToSavePayload normalizes overlapping dock-full before save', () => {
    const stalePage: DashboardPageState = {
      id: 'page-1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'facility-viewer',
          type: 'facility-viewer',
          title: 'Facility 3D View',
          size: 'dock-full',
        },
        {
          id: 'stats-facilities',
          type: 'stats-facilities',
          title: 'Facilities',
          size: 'medium',
        },
      ],
      layouts: {
        lg: [
          { i: 'facility-viewer', x: 0, y: 0, w: 12, h: 6 },
          { i: 'stats-facilities', x: 0, y: 0, w: 3, h: 2 },
        ],
        md: [],
        sm: [],
      },
    };

    const [savedPage] = pagesToSavePayload([stalePage]);
    expect(savedPage.widgets).toHaveLength(2);
    const positions = savedPage.widgets.map((w) => w.layoutConfig.position);
    const items = positions.map((p, i) => ({
      i: savedPage.widgets[i].widgetId,
      ...p,
    }));
    const { valid } = validateLayout(items);
    expect(valid).toBe(true);
    expect(
      savedPage.widgets.find((w) => w.widgetId === 'facility-viewer')?.layoutConfig
        .position
    ).toMatchObject({ x: 3, y: 0, w: 9, h: 6 });
  });
});
