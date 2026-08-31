import { UserRole } from '@/types/auth.types';
import { canAccessWidget, filterWidgetsByRole } from '@/utils/rbac.utils';
import type { WidgetTypeDefinition } from '@/types/widget.types';

describe('rbac.utils', () => {
  it('allows dev_admin when admin is listed', () => {
    expect(
      canAccessWidget(UserRole.DEV_ADMIN, ['admin', 'facility_admin'])
    ).toBe(true);
  });

  it('allows maintenance when facility_admin is listed', () => {
    expect(
      canAccessWidget(UserRole.MAINTENANCE, ['facility_admin'])
    ).toBe(true);
  });

  it('denies tenant for admin-only widgets', () => {
    expect(canAccessWidget(UserRole.TENANT, ['admin'])).toBe(false);
  });

  it('filterWidgetsByRole drops disallowed widgets', () => {
    const widgets: WidgetTypeDefinition[] = [
      {
        type: 'a',
        name: 'A',
        description: '',
        defaultSize: 'medium',
        availableSizes: ['medium'],
        allowMultiple: false,
        category: 'analytics',
        requiredPermissions: ['admin'],
      },
      {
        type: 'b',
        name: 'B',
        description: '',
        defaultSize: 'medium',
        availableSizes: ['medium'],
        allowMultiple: false,
        category: 'activity',
        requiredPermissions: ['tenant'],
      },
    ];
    expect(filterWidgetsByRole(widgets, UserRole.TENANT).map((w) => w.type)).toEqual(['b']);
  });
});
