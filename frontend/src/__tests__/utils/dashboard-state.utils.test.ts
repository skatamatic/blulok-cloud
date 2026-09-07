import { syncPageWithClampedLayout, isPersistedPageId } from '@/utils/dashboard-state.utils';
import { layoutItemFromSize } from '@/utils/dashboard-layout-engine';
import { DashboardPageState } from '@/types/widget-management.types';

describe('syncPageWithClampedLayout', () => {
  it('applies dock-full grid geometry when instance size is dock-full', () => {
    const page: DashboardPageState = {
      id: 'p1',
      name: 'Main',
      pageOrder: 0,
      widgetInstances: [
        {
          id: 'facility-viewer',
          type: 'facility-viewer',
          title: 'Facility 3D View',
          size: 'dock-full',
        },
      ],
      layouts: { lg: [], md: [], sm: [] },
    };

    const clamped = [layoutItemFromSize('facility-viewer', 'dock-full')];
    const { page: result } = syncPageWithClampedLayout(page, clamped);

    expect(result.layouts.lg[0]).toMatchObject({ i: 'facility-viewer', x: 0, y: 0, w: 12, h: 6 });
  });

  it('re-applies prior dock preset when instance size was not updated yet', () => {
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
      layouts: { lg: [], md: [], sm: [] },
    };

    const clamped = [layoutItemFromSize('facility-viewer', 'dock-full')];
    const { page: result } = syncPageWithClampedLayout(page, clamped);

    expect(result.layouts.lg[0]).toMatchObject({ w: 6, h: 6, x: 0, y: 0 });
  });

  it('previewResize keeps live grid cells but updates widget.size tier', () => {
    const page: DashboardPageState = {
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

    const live = [{ i: 'stats-facilities', x: 0, y: 0, w: 1, h: 1 }];
    const { page: result } = syncPageWithClampedLayout(page, live, {
      previewResize: true,
    });

    expect(result.widgetInstances[0].size).toBe('tiny');
    expect(result.layouts.lg[0]).toMatchObject({ w: 1, h: 1 });
  });
});

describe('isPersistedPageId', () => {
  it('accepts server UUID page ids', () => {
    expect(isPersistedPageId('550e8400-e29b-41d4-a716-446655440001')).toBe(true);
  });

  it('rejects local and legacy placeholder ids', () => {
    expect(isPersistedPageId('local-default')).toBe(false);
    expect(isPersistedPageId('legacy-main')).toBe(false);
    expect(isPersistedPageId('page-1')).toBe(false);
  });
});
