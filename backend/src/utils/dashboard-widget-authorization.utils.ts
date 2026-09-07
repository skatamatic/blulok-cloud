/**
 * Widget authorization for dashboard layout resolution.
 * Uses the code registry as source of truth for RBAC; DB templates enrich metadata when present.
 */

import { DefaultWidgetTemplate } from '@/models/user-widget-layout.model';
import { DashboardWidgetPayload } from '@/models/user-widget-layout.model';
import { WidgetTypeDefinition, WidgetTypeHelper } from '@/types/widget.types';

export function resolveCanonicalWidgetType(
  widgetId: string,
  widgetType?: string
): string {
  if (widgetType && WidgetTypeHelper.isValidWidgetType(widgetType)) {
    return widgetType;
  }
  return WidgetTypeHelper.extractWidgetTypeFromId(widgetId);
}

export function isWidgetTypeAllowedForRole(
  canonicalType: string,
  userRole: string
): boolean {
  const definition = WidgetTypeHelper.getWidgetType(canonicalType);
  if (!definition) {
    return false;
  }
  if (!definition.requiredPermissions || definition.requiredPermissions.length === 0) {
    return true;
  }
  return definition.requiredPermissions.includes(userRole);
}

export function findTemplateForWidget(
  templates: DefaultWidgetTemplate[],
  widgetId: string,
  canonicalType: string
): DefaultWidgetTemplate | undefined {
  return templates.find(
    (t) =>
      t.widget_id === widgetId ||
      t.widget_id === canonicalType ||
      t.widget_type === canonicalType
  );
}

export function snapshotWidgetToApiShape(
  widget: DashboardWidgetPayload,
  templates: DefaultWidgetTemplate[]
) {
  const canonicalType = resolveCanonicalWidgetType(widget.widgetId, widget.widgetType);
  const registryDef = WidgetTypeHelper.getWidgetType(canonicalType);
  const template = findTemplateForWidget(templates, widget.widgetId, canonicalType);

  return {
    widgetId: widget.widgetId,
    widgetType: canonicalType,
    name: template?.name || registryDef?.name || widget.widgetId,
    description: template?.description ?? registryDef?.description,
    layoutConfig: widget.layoutConfig,
    config: widget.config ?? {},
    availableSizes:
      template?.available_sizes || registryDef?.availableSizes || ['medium'],
    isVisible: widget.isVisible ?? true,
    displayOrder: widget.displayOrder,
  };
}

export function filterSnapshotWidgetsForRole(
  widgets: DashboardWidgetPayload[],
  userRole: string
): DashboardWidgetPayload[] {
  return widgets.filter((w) => {
    const canonicalType = resolveCanonicalWidgetType(w.widgetId, w.widgetType);
    return isWidgetTypeAllowedForRole(canonicalType, userRole);
  });
}

export function getRegistryDefinition(
  canonicalType: string
): WidgetTypeDefinition | undefined {
  return WidgetTypeHelper.getWidgetType(canonicalType);
}
