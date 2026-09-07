/**
 * Dashboard layout payload serialization (shared by models and layout service).
 */

import {
  UserWidgetLayoutModel,
  DashboardPagePayload,
  DashboardWidgetPayload,
} from '@/models/user-widget-layout.model';
import {
  clampLayout,
  GRID_COLS,
  isDockSize,
  layoutWithFlexibleDocks,
  validateLayout,
  validateLayoutConfig,
} from '@/utils/dashboard-layout-engine';
import { WidgetSize } from '@/types/widget.types';

export interface DashboardSnapshot {
  version: 1;
  pages: DashboardPagePayload[];
}

interface LayoutGeometry {
  position: { x: number; y: number; w: number; h: number };
  size: string;
}

type ClampableWidget = {
  widgetId: string;
  widgetType?: string;
  layoutConfig: Record<string, unknown>;
};

function readLayoutGeometry(layoutConfig: Record<string, unknown>): LayoutGeometry | null {
  const position = layoutConfig.position;
  const size = layoutConfig.size;
  if (!position || typeof position !== 'object') {
    return null;
  }
  const pos = position as Record<string, unknown>;
  if (
    typeof pos.x !== 'number' ||
    typeof pos.y !== 'number' ||
    typeof pos.w !== 'number' ||
    typeof pos.h !== 'number'
  ) {
    return null;
  }
  return {
    position: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
    size: typeof size === 'string' ? size : 'medium',
  };
}

function parseLayoutConfig(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  return (raw ?? {}) as Record<string, unknown>;
}

export function widgetRowToPayload(widget: {
  widget_id: string;
  widget_type: string;
  layout_config: unknown;
  display_order: number;
  is_visible: boolean;
}): DashboardPagePayload['widgets'][number] {
  const lc = parseLayoutConfig(widget.layout_config);
  const config = (lc.config ?? {}) as Record<string, unknown>;
  const { config: _omit, ...layoutConfig } = lc;
  return {
    widgetId: widget.widget_id,
    widgetType: widget.widget_type,
    config,
    layoutConfig,
    displayOrder: widget.display_order,
    isVisible: widget.is_visible,
  };
}

export function clampWidgetsOnPage<T extends ClampableWidget>(widgets: T[]): T[] {
  const parsed = widgets
    .map((w) => ({ widget: w, geometry: readLayoutGeometry(w.layoutConfig) }))
    .filter(
      (entry): entry is { widget: T; geometry: LayoutGeometry } => entry.geometry !== null
    );

  if (parsed.length === 0) {
    return [];
  }

  const items = parsed.map(({ widget, geometry }) => ({
    i: widget.widgetId,
    ...geometry.position,
  }));
  const instances = parsed.map(({ widget, geometry }) => ({
    id: widget.widgetId,
    type: widget.widgetType ?? widget.widgetId,
    size: geometry.size as WidgetSize,
  }));
  const dockIds = new Set(
    instances.filter((i) => isDockSize(i.size)).map((i) => i.id)
  );
  const nonDockRaw = items.filter((item) => !dockIds.has(item.i));
  const nonDockClamped = clampLayout(nonDockRaw, GRID_COLS, undefined);
  const reflowed = layoutWithFlexibleDocks(nonDockClamped, instances);
  const byId = new Map(reflowed.map((c) => [c.i, c]));

  return parsed
    .filter(({ widget }) => byId.has(widget.widgetId))
    .map(({ widget, geometry }) => {
      const c = byId.get(widget.widgetId)!;
      return {
        ...widget,
        layoutConfig: {
          ...widget.layoutConfig,
          position: { x: c.x, y: c.y, w: c.w, h: c.h },
          size: geometry.size,
        },
      };
    });
}

export function validateWidgetsOnPage(widgets: ClampableWidget[]): string | null {
  for (const widget of widgets) {
    const geometry = readLayoutGeometry(widget.layoutConfig);
    if (!geometry) {
      return `Invalid layout config for widget "${widget.widgetId}"`;
    }
  }

  const items = widgets.flatMap((w) => {
    const geometry = readLayoutGeometry(w.layoutConfig);
    return geometry
      ? [{ i: w.widgetId, ...geometry.position }]
      : [];
  });
  const { valid, error } = validateLayout(items);
  if (!valid) {
    return error ?? 'Invalid layout';
  }
  for (const w of widgets) {
    const geometry = readLayoutGeometry(w.layoutConfig);
    if (!geometry) {
      continue;
    }
    const check = validateLayoutConfig(geometry.position, geometry.size);
    if (!check.valid) {
      return check.error ?? 'Invalid widget layout';
    }
  }
  return null;
}

export async function workingLayoutToPayload(userId: string): Promise<DashboardPagePayload[]> {
  const { pages, widgetsByPageId } =
    await UserWidgetLayoutModel.findPagesWithWidgets(userId);

  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    pageOrder: page.page_order,
    widgets: (widgetsByPageId.get(page.id) ?? []).map(widgetRowToPayload),
  }));
}

export function clampAndValidatePages(pages: DashboardPagePayload[]): {
  pages: DashboardPagePayload[];
  error: string | null;
} {
  const clampedPages: DashboardPagePayload[] = pages.map((page) => ({
    ...page,
    widgets: clampWidgetsOnPage<DashboardWidgetPayload>(page.widgets),
  }));
  for (const page of clampedPages) {
    const err = validateWidgetsOnPage(page.widgets);
    if (err) {
      return { pages: clampedPages, error: err };
    }
  }
  return { pages: clampedPages, error: null };
}
