import {
  filterSnapshotWidgetsForRole,
  resolveCanonicalWidgetType,
  snapshotWidgetToApiShape,
} from '@/utils/dashboard-widget-authorization.utils';
import { UserRole } from '@/types/auth.types';
import { DashboardWidgetPayload } from '@/models/user-widget-layout.model';

describe('dashboard-widget-authorization.utils', () => {
  const facilityAdminWidgets: DashboardWidgetPayload[] = [
    {
      widgetId: 'units-manager',
      widgetType: 'units-manager',
      layoutConfig: { position: { x: 0, y: 4, w: 12, h: 2 }, size: 'dock-bottom' },
      displayOrder: 0,
      isVisible: true,
    },
    {
      widgetId: 'facility-viewer',
      widgetType: 'facility-viewer',
      layoutConfig: { position: { x: 0, y: 0, w: 12, h: 4 }, size: 'huge' },
      displayOrder: 1,
      isVisible: true,
    },
    {
      widgetId: 'remote-gate',
      widgetType: 'remote-gate',
      layoutConfig: { position: { x: 0, y: 2, w: 6, h: 2 }, size: 'medium' },
      displayOrder: 2,
      isVisible: true,
    },
    {
      widgetId: 'daily-access-codes',
      widgetType: 'daily-access-codes',
      layoutConfig: { position: { x: 6, y: 2, w: 6, h: 2 }, size: 'medium' },
      displayOrder: 3,
      isVisible: true,
    },
    {
      widgetId: 'histogram',
      widgetType: 'histogram',
      layoutConfig: { position: { x: 0, y: 4, w: 12, h: 2 }, size: 'large-wide' },
      displayOrder: 4,
      isVisible: true,
    },
  ];

  it('resolves legacy widget ids to canonical types', () => {
    expect(resolveCanonicalWidgetType('units_manager', 'units-manager')).toBe(
      'units-manager'
    );
    expect(resolveCanonicalWidgetType('units-manager_1')).toBe('units-manager');
  });

  it('keeps facility-admin widgets even without DB templates', () => {
    const allowed = filterSnapshotWidgetsForRole(
      facilityAdminWidgets,
      UserRole.FACILITY_ADMIN
    );
    expect(allowed.map((w) => w.widgetId)).toEqual([
      'units-manager',
      'facility-viewer',
      'remote-gate',
      'daily-access-codes',
      'histogram',
    ]);
  });

  it('drops widgets the role cannot access', () => {
    const allowed = filterSnapshotWidgetsForRole(
      [
        {
          widgetId: 'units-manager',
          widgetType: 'units-manager',
          layoutConfig: { position: { x: 0, y: 4, w: 12, h: 2 }, size: 'dock-bottom' },
          displayOrder: 0,
          isVisible: true,
        },
      ],
      UserRole.TENANT
    );
    expect(allowed).toHaveLength(0);
  });

  it('enriches snapshot widgets from registry when template is missing', () => {
    const shaped = snapshotWidgetToApiShape(facilityAdminWidgets[1], []);
    expect(shaped.name).toBe('Facility 3D View');
    expect(shaped.availableSizes).toContain('huge');
    expect(shaped.widgetType).toBe('facility-viewer');
  });
});
