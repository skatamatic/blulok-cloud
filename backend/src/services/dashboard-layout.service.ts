/**
 * Shared dashboard layout serialization and API response building.
 */

import {
  UserWidgetLayoutModel,
  DefaultWidgetTemplateModel,
} from '@/models/user-widget-layout.model';
import {
  SavedDashboardModel,
  DashboardAssignmentModel,
} from '@/models/saved-dashboard.model';
import { AuthService } from '@/services/auth.service';
import { ActiveFacilityContext } from '@/utils/dashboard-assignment.utils';
import {
  clampAndValidatePages,
  clampWidgetsOnPage,
  DashboardSnapshot,
  workingLayoutToPayload,
} from '@/utils/dashboard-layout-payload.utils';
import {
  filterSnapshotWidgetsForRole,
  findTemplateForWidget,
  resolveCanonicalWidgetType,
  snapshotWidgetToApiShape,
} from '@/utils/dashboard-widget-authorization.utils';
import { WidgetTypeHelper } from '@/types/widget.types';

export type { DashboardSnapshot };
export {
  clampAndValidatePages,
  clampWidgetsOnPage,
  workingLayoutToPayload,
  widgetRowToPayload,
  validateWidgetsOnPage,
} from '@/utils/dashboard-layout-payload.utils';

function parseLayoutConfig(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  return (raw ?? {}) as Record<string, unknown>;
}

export function widgetToApiShape(
  widget: {
    widget_id: string;
    widget_type: string;
    layout_config: unknown;
    is_visible: boolean;
    display_order: number;
  },
  template?: { name?: string; description?: string; available_sizes?: string[] }
) {
  const layoutConfig = parseLayoutConfig(widget.layout_config);
  const widgetConfig = (layoutConfig.config ?? {}) as Record<string, unknown>;
  return {
    widgetId: widget.widget_id,
    widgetType: widget.widget_type,
    name: template?.name || widget.widget_id,
    description: template?.description,
    layoutConfig,
    config: widgetConfig,
    availableSizes: template?.available_sizes || ['medium'],
    isVisible: widget.is_visible,
    displayOrder: widget.display_order,
  };
}

export interface DashboardLayoutApiMeta {
  layoutSource: 'assigned' | 'personal' | 'default';
  assignedDashboardId?: string;
  assignedDashboardName?: string;
  hasAssignedOverride?: boolean;
  canEditLayout: boolean;
  allowMultiplePages: boolean;
  isDefault: boolean;
}

export async function snapshotToApiPages(
  savedDashboardId: string,
  userRole: string
): Promise<{ pages: Awaited<ReturnType<typeof buildPagesFromDb>>; name: string } | null> {
  const saved = await SavedDashboardModel.findById(savedDashboardId);
  if (!saved) return null;

  const raw =
    typeof saved.snapshot === 'string'
      ? (JSON.parse(saved.snapshot) as DashboardSnapshot)
      : saved.snapshot;
  const { pages: clamped, error } = clampAndValidatePages(raw.pages);
  if (error) {
    throw new Error(error);
  }

  const availableTemplates =
    await DefaultWidgetTemplateModel.getAvailableForUser(userRole);

  const pages = clamped.map((page) => ({
    id: page.id,
    name: page.name,
    pageOrder: page.pageOrder,
    widgets: filterSnapshotWidgetsForRole(page.widgets, userRole)
      .map((w) => snapshotWidgetToApiShape(w, availableTemplates))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }));

  return { pages, name: saved.name };
}

type ApiPage = {
  id?: string;
  name?: string;
  pageOrder: number;
  widgets: ReturnType<typeof widgetToApiShape>[];
};

async function buildPagesFromDb(
  userId: string,
  userRole: string,
  cached?: Awaited<ReturnType<typeof UserWidgetLayoutModel.findPagesWithWidgets>>
): Promise<ApiPage[]> {
  const availableTemplates =
    await DefaultWidgetTemplateModel.getAvailableForUser(userRole);
  const { pages: dbPages, widgetsByPageId } =
    cached ?? (await UserWidgetLayoutModel.findPagesWithWidgets(userId));

  return dbPages.map((page) => {
    const widgets = (widgetsByPageId.get(page.id) ?? []).map((w) => {
      const canonicalType = resolveCanonicalWidgetType(w.widget_id, w.widget_type);
      const template = findTemplateForWidget(
        availableTemplates,
        w.widget_id,
        canonicalType
      );
      const registryDef = WidgetTypeHelper.getWidgetType(canonicalType);
      return widgetToApiShape(w, {
        name: template?.name ?? registryDef?.name,
        description: template?.description ?? registryDef?.description,
        available_sizes:
          template?.available_sizes ?? registryDef?.availableSizes,
      });
    });
    return {
      id: page.id,
      name: page.name,
      pageOrder: page.page_order,
      widgets: widgets.sort((a, b) => a.displayOrder - b.displayOrder),
    };
  });
}

async function buildDefaultPages(userRole: string): Promise<ApiPage[]> {
  const availableTemplates =
    await DefaultWidgetTemplateModel.getAvailableForUser(userRole);
  const defaultPage = {
    id: undefined as string | undefined,
    name: 'Main',
    pageOrder: 0,
    widgets: availableTemplates.map((template) => ({
      widgetId: template.widget_id,
      widgetType: template.widget_type,
      name: template.name,
      description: template.description,
      layoutConfig: template.default_config,
      config: {},
      availableSizes: template.available_sizes,
      isVisible: true,
      displayOrder: template.default_order,
    })),
  };
  const clampedDefault = {
    ...defaultPage,
    widgets: clampWidgetsOnPage(defaultPage.widgets),
  };
  return [clampedDefault];
}

/** Lightweight metadata for admin personal-override banner (no snapshot parse). */
async function resolveAssignedMeta(
  userId: string,
  userRole: string,
  facilityContext: ActiveFacilityContext
): Promise<{ assignedDashboardId?: string; assignedDashboardName?: string }> {
  const resolved = await DashboardAssignmentModel.resolveAssignment(
    userId,
    userRole,
    facilityContext
  );
  if (!resolved) {
    return {};
  }
  const saved = await SavedDashboardModel.findById(resolved.savedDashboardId);
  return {
    assignedDashboardId: resolved.savedDashboardId,
    assignedDashboardName: saved?.name,
  };
}

export async function buildDashboardApiResponse(
  userId: string,
  userRole: string,
  facilityContext: ActiveFacilityContext = { mode: 'all' }
) {
  const canEditLayout = AuthService.isAdmin(userRole as import('@/types/auth.types').UserRole);
  const isAdminUser = canEditLayout;

  const dbLayout = await UserWidgetLayoutModel.findPagesWithWidgets(userId);
  const hasPersonal = dbLayout.pages.length > 0;

  if (isAdminUser && hasPersonal) {
    const pages = await buildPagesFromDb(userId, userRole, dbLayout);
    const assignedMeta = await resolveAssignedMeta(userId, userRole, facilityContext);
    return {
      pages,
      layouts: pages[0]?.widgets ?? [],
      layoutSource: 'personal' as const,
      canEditLayout,
      allowMultiplePages: pages.length > 1,
      isDefault: false,
      hasAssignedOverride: !!assignedMeta.assignedDashboardId,
      ...assignedMeta,
    };
  }

  const resolved = await DashboardAssignmentModel.resolveAssignment(
    userId,
    userRole,
    facilityContext
  );

  if (resolved) {
    const snapshotResult = await snapshotToApiPages(
      resolved.savedDashboardId,
      userRole
    );
    if (snapshotResult) {
      const { pages, name } = snapshotResult;
      return {
        pages,
        layouts: pages[0]?.widgets ?? [],
        layoutSource: 'assigned' as const,
        assignedDashboardId: resolved.savedDashboardId,
        assignedDashboardName: name,
        canEditLayout,
        allowMultiplePages: pages.length > 1,
        isDefault: false,
      };
    }
  }

  const pages = await buildDefaultPages(userRole);
  return {
    pages,
    layouts: pages[0]?.widgets ?? [],
    layoutSource: 'default' as const,
    canEditLayout,
    allowMultiplePages: pages.length > 1,
    isDefault: true,
  };
}
