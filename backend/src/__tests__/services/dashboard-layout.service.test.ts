import {
  clampAndValidatePages,
  clampWidgetsOnPage,
} from '@/utils/dashboard-layout-payload.utils';
import { buildDashboardApiResponse, snapshotToApiPages } from '@/services/dashboard-layout.service';
import { UserWidgetLayoutModel } from '@/models/user-widget-layout.model';
import { DashboardAssignmentModel } from '@/models/saved-dashboard.model';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/user-widget-layout.model', () => ({
  UserWidgetLayoutModel: {
    findPagesWithWidgets: jest.fn(),
  },
  DefaultWidgetTemplateModel: {
    getAvailableForUser: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/models/saved-dashboard.model', () => ({
  SavedDashboardModel: {
    findById: jest.fn(),
  },
  DashboardAssignmentModel: {
    resolveAssignment: jest.fn(),
  },
}));
import { DashboardPagePayload } from '@/models/user-widget-layout.model';

describe('dashboard-layout.service', () => {
  const samplePages: DashboardPagePayload[] = [
    {
      id: 'page-1',
      name: 'Main',
      pageOrder: 0,
      widgets: [
        {
          widgetId: 'facilities_stats',
          widgetType: 'stats',
          layoutConfig: {
            position: { x: 0, y: 0, w: 3, h: 2 },
            size: 'medium',
          },
          displayOrder: 0,
          isVisible: true,
        },
        {
          widgetId: 'units_manager',
          widgetType: 'units-manager',
          layoutConfig: {
            position: { x: 3, y: 0, w: 9, h: 3 },
            size: 'dock-bottom',
          },
          displayOrder: 1,
          isVisible: true,
        },
      ],
    },
  ];

  it('clampAndValidatePages preserves displayOrder through clamp', () => {
    const { pages, error } = clampAndValidatePages(samplePages);
    expect(error).toBeNull();
    expect(pages).toHaveLength(1);
    expect(pages[0].widgets).toHaveLength(2);
    expect(pages[0].widgets[0].displayOrder).toBe(0);
    expect(pages[0].widgets[1].displayOrder).toBe(1);
    expect(pages[0].widgets[0].layoutConfig.position).toEqual(
      expect.objectContaining({ w: expect.any(Number), h: expect.any(Number) })
    );
  });

  it('clampWidgetsOnPage drops widgets with invalid layout config', () => {
    const clamped = clampWidgetsOnPage([
      {
        widgetId: 'bad',
        layoutConfig: { broken: true },
        displayOrder: 0,
      } as DashboardPagePayload['widgets'][number],
      ...samplePages[0].widgets,
    ]);
    expect(clamped).toHaveLength(2);
    expect(clamped.every((w) => w.widgetId !== 'bad')).toBe(true);
  });

  it('round-trips snapshot-shaped pages through clamp and validate', () => {
    const snapshot = { version: 1 as const, pages: samplePages };
    const firstPass = clampAndValidatePages(snapshot.pages);
    expect(firstPass.error).toBeNull();

    const secondPass = clampAndValidatePages(firstPass.pages);
    expect(secondPass.error).toBeNull();
    expect(secondPass.pages[0].widgets.map((w) => w.widgetId)).toEqual(
      firstPass.pages[0].widgets.map((w) => w.widgetId)
    );
  });

  describe('buildDashboardApiResponse', () => {
    const userId = 'user-1';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns assigned layout for non-admin even when personal rows exist', async () => {
      (UserWidgetLayoutModel.findPagesWithWidgets as jest.Mock).mockResolvedValue({
        pages: [{ id: 'p1', name: 'Main', page_order: 0 }],
        widgetsByPageId: new Map(),
      });
      (DashboardAssignmentModel.resolveAssignment as jest.Mock).mockResolvedValue({
        savedDashboardId: 'dash-1',
        assignmentId: 'a1',
        scope: 'global',
      });
      const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
      SavedDashboardModel.findById.mockResolvedValue({
        id: 'dash-1',
        name: 'Org Dashboard',
        snapshot: {
          version: 1,
          pages: [
            {
              id: 'sp1',
              name: 'Main',
              pageOrder: 0,
              widgets: [],
            },
          ],
        },
      });

      const response = await buildDashboardApiResponse(
        userId,
        UserRole.FACILITY_ADMIN
      );

      expect(response.layoutSource).toBe('assigned');
      expect(response.canEditLayout).toBe(false);
    });

    it('returns personal layout for admin with working rows', async () => {
      (UserWidgetLayoutModel.findPagesWithWidgets as jest.Mock).mockResolvedValue({
        pages: [{ id: 'p1', name: 'Main', page_order: 0 }],
        widgetsByPageId: new Map([['p1', []]]),
      });
      (DashboardAssignmentModel.resolveAssignment as jest.Mock).mockResolvedValue({
        savedDashboardId: 'dash-1',
        assignmentId: 'a1',
        scope: 'global',
      });
      const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
      SavedDashboardModel.findById.mockResolvedValue({
        id: 'dash-1',
        name: 'Org Dashboard',
        snapshot: { version: 1, pages: [{ id: 'sp1', name: 'Main', pageOrder: 0, widgets: [] }] },
      });

      const response = await buildDashboardApiResponse(userId, UserRole.ADMIN);

      expect(response.layoutSource).toBe('personal');
      expect(response.hasAssignedOverride).toBe(true);
      expect(response.assignedDashboardName).toBe('Org Dashboard');
      expect(response.allowMultiplePages).toBe(true);
    });

    it('allows page management for admin with a single working page', async () => {
      (UserWidgetLayoutModel.findPagesWithWidgets as jest.Mock).mockResolvedValue({
        pages: [{ id: 'p1', name: 'Main', page_order: 0 }],
        widgetsByPageId: new Map([['p1', []]]),
      });
      (DashboardAssignmentModel.resolveAssignment as jest.Mock).mockResolvedValue(null);

      const adminResponse = await buildDashboardApiResponse(userId, UserRole.ADMIN);
      expect(adminResponse.allowMultiplePages).toBe(true);
      expect(adminResponse.pages).toHaveLength(1);

      const devAdminResponse = await buildDashboardApiResponse(userId, UserRole.DEV_ADMIN);
      expect(devAdminResponse.allowMultiplePages).toBe(true);

      (DashboardAssignmentModel.resolveAssignment as jest.Mock).mockResolvedValue({
        savedDashboardId: 'dash-1',
        assignmentId: 'a1',
        scope: 'global',
      });
      const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
      SavedDashboardModel.findById.mockResolvedValue({
        id: 'dash-1',
        name: 'Org Dashboard',
        snapshot: { version: 1, pages: [{ id: 'sp1', name: 'Main', pageOrder: 0, widgets: [] }] },
      });

      const tenantResponse = await buildDashboardApiResponse(userId, UserRole.FACILITY_ADMIN);
      expect(tenantResponse.allowMultiplePages).toBe(false);
    });
  });

  describe('snapshotToApiPages', () => {
    it('preserves registry widgets for facility admin without DB template rows', async () => {
      const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
      const { DefaultWidgetTemplateModel } = jest.requireMock(
        '@/models/user-widget-layout.model'
      );

      SavedDashboardModel.findById.mockResolvedValue({
        id: 'dash-1',
        name: 'Staff template',
        snapshot: {
          version: 1,
          pages: [
            {
              id: 'sp1',
              name: 'Main',
              pageOrder: 0,
              widgets: [
                {
                  widgetId: 'units-manager',
                  widgetType: 'units-manager',
                  layoutConfig: {
                    position: { x: 0, y: 4, w: 12, h: 2 },
                    size: 'dock-bottom',
                  },
                  displayOrder: 0,
                  isVisible: true,
                },
                {
                  widgetId: 'facility-viewer',
                  widgetType: 'facility-viewer',
                  layoutConfig: {
                    position: { x: 0, y: 0, w: 12, h: 2 },
                    size: 'huge',
                  },
                  displayOrder: 1,
                  isVisible: true,
                },
                {
                  widgetId: 'histogram',
                  widgetType: 'histogram',
                  layoutConfig: {
                    position: { x: 0, y: 2, w: 12, h: 2 },
                    size: 'large-wide',
                  },
                  displayOrder: 2,
                  isVisible: true,
                },
              ],
            },
          ],
        },
      });

      DefaultWidgetTemplateModel.getAvailableForUser.mockResolvedValue([
        {
          widget_id: 'facilities_stats',
          widget_type: 'stats',
          name: 'Total Facilities',
          available_sizes: ['medium'],
        },
      ]);

      const result = await snapshotToApiPages('dash-1', UserRole.FACILITY_ADMIN);

      expect(result?.pages[0].widgets.map((w) => w.widgetType)).toEqual([
        'units-manager',
        'facility-viewer',
        'histogram',
      ]);
      expect(result?.pages[0].widgets[1].name).toBe('Facility 3D View');
    });
  });
});
