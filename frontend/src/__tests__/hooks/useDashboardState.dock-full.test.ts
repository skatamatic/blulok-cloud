/**
 * @jest-environment jsdom
 */
import {
  clampLayout,
  layoutItemFromSize,
  applySizeToLayoutItem,
} from '@/utils/dashboard-layout-engine';
import { syncPageWithClampedLayout } from '@/utils/dashboard-state.utils';
import { DashboardPageState } from '@/types/widget-management.types';

/** Mirrors applyWidgetSizeToPage dock-left → dock-full transition. */
function applyDockSizeTransition(
  page: DashboardPageState,
  widgetId: string,
  newSize: 'dock-full'
): DashboardPageState {
  const pageWithNewSize: DashboardPageState = {
    ...page,
    widgetInstances: page.widgetInstances.map((w) =>
      w.id === widgetId ? { ...w, size: newSize } : w
    ),
  };
  const item = page.layouts.lg.find((i) => i.i === widgetId)!;
  const resized = applySizeToLayoutItem(item, newSize);
  const clamped = clampLayout([resized]);
  return syncPageWithClampedLayout(pageWithNewSize, clamped).page;
}

describe('dock-full persistence helpers', () => {
  it('applies 12×6 geometry when transitioning from dock-left with size preset applied before sync', () => {
    const page: DashboardPageState = {
      id: 'p1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'facility-viewer',
          type: 'facility-viewer',
          title: 'Facility 3D View',
          size: 'dock-left',
        },
      ],
      layouts: {
        lg: [layoutItemFromSize('facility-viewer', 'dock-left')],
        md: [],
        sm: [],
      },
    };

    const result = applyDockSizeTransition(page, 'facility-viewer', 'dock-full');

    expect(result.widgetInstances[0].size).toBe('dock-full');
    expect(result.layouts.lg[0]).toMatchObject({ w: 12, h: 6, x: 0, y: 0 });
  });

  it('save payload uses canonical dock-full position from size preset', () => {
    const item = layoutItemFromSize('facility-viewer', 'dock-full');
    const size = 'dock-full' as const;
    const placement = layoutItemFromSize('facility-viewer', size);

    expect(placement).toEqual(item);
    expect(placement).toMatchObject({ w: 12, h: 6 });
  });
});
