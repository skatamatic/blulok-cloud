import { Layout } from 'react-grid-layout';
import { getWidgetType } from '@/config/widgetRegistry';
import {
  WidgetInstance,
  DashboardPageState,
} from '@/types/widget-management.types';
import { WidgetSize } from '@/types/widget.types';
import {
  deriveContentTierFromGrid,
  contentTierForUndock,
  isValidSize,
} from '@/utils/widget-size.utils';
import {
  applySizeToLayoutItem,
  validateLayout,
  validateProposedFreeLayout,
  GridLayoutItem,
  isDockSize,
  layoutWithFlexibleDocks,
  snapGridItem,
} from '@/utils/dashboard-layout-engine';
import {
  buildResponsiveLayouts,
  syncPageWithClampedLayout,
  isPersistedPageId,
} from '@/utils/dashboard-state.utils';

export function mapBackendWidgetType(widget: {
  widgetId: string;
  widgetType?: string;
}): string {
  const backendWidgetType = widget.widgetType || 'facilities';
  if (backendWidgetType === 'units-manager' || backendWidgetType === 'unitsmanager') {
    return 'units-manager';
  }
  if (backendWidgetType === 'syncfms') return 'sync-fms';
  if (backendWidgetType === 'remotegate') return 'remote-gate';
  if (backendWidgetType === 'lockstatus') return 'lock-status';
  if (backendWidgetType === 'accesshistory') return 'access-history';
  if (backendWidgetType === 'sharedkeys') return 'shared-keys';
  if (backendWidgetType === 'unlockedunits') return 'unlocked-units';
  if (backendWidgetType === 'batterystatus') return 'battery-status';
  if (backendWidgetType === 'activitymonitor') return 'activity-monitor';
  if (backendWidgetType === 'facilityviewer' || backendWidgetType === 'facility-viewer') {
    return 'facility-viewer';
  }
  if (backendWidgetType === 'stats') {
    if (widget.widgetId.includes('facilities')) return 'stats-facilities';
    if (widget.widgetId.includes('devices')) return 'stats-devices';
    if (widget.widgetId.includes('users')) return 'stats-users';
    if (widget.widgetId.includes('alerts')) return 'stats-alerts';
    return `stats-${backendWidgetType}`;
  }
  const direct = getWidgetType(backendWidgetType);
  if (direct) return backendWidgetType;
  return `stats-${backendWidgetType}`;
}

function resolveLoadedContentTier(
  frontendType: string,
  layoutConfig: {
    size?: string;
    position: { x: number; y: number; w: number; h: number };
  }
): WidgetSize {
  const pos = layoutConfig.position;
  const saved = layoutConfig.size;
  if (saved && isValidSize(saved) && isDockSize(saved)) {
    return saved;
  }
  return deriveContentTierFromGrid(
    frontendType,
    pos.w,
    pos.h,
    saved as WidgetSize | undefined
  );
}

/** @deprecated Use resolveLoadedContentTier */
export const resolveLoadedWidgetSize = resolveLoadedContentTier;

export function pageFromApiWidgets(
  pageId: string,
  name: string,
  pageOrder: number,
  apiWidgets: Array<{
    widgetId: string;
    widgetType?: string;
    layoutConfig: { position: { x: number; y: number; w: number; h: number }; size?: string };
    config?: Record<string, unknown>;
    displayOrder?: number;
  }>
): { page: DashboardPageState; droppedCount: number } {
  const sorted = [...apiWidgets].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );

  const lgItems: GridLayoutItem[] = [];
  const instances: WidgetInstance[] = [];

  for (const widget of sorted) {
    const frontendType = mapBackendWidgetType(widget);
    const typeConfig = getWidgetType(frontendType);
    if (!typeConfig) continue;

    const size = resolveLoadedContentTier(frontendType, widget.layoutConfig);
    const pos = widget.layoutConfig.position;

    const item = snapGridItem({
      i: widget.widgetId,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pos.h,
    });

    lgItems.push(item);

    instances.push({
      id: widget.widgetId,
      type: frontendType,
      title: typeConfig.name,
      size,
      config: widget.config ?? {},
    });
  }

  const dockIds = new Set(
    instances.filter((i) => isDockSize(i.size)).map((i) => i.id)
  );
  const nonDockFromApi = lgItems.filter((item) => !dockIds.has(item.i));
  const reflowed = layoutWithFlexibleDocks(nonDockFromApi, instances);
  const base: DashboardPageState = {
    id: pageId,
    name,
    pageOrder,
    widgetInstances: instances,
    layouts: buildResponsiveLayouts(reflowed),
  };
  return syncPageWithClampedLayout(base, reflowed);
}

/** Save → reload round-trip helper for tests and diagnostics. */
export function roundTripPageLayout(page: DashboardPageState): DashboardPageState {
  const [saved] = pagesToSavePayload([page]);
  return pageFromApiWidgets(
    page.id,
    page.name,
    page.pageOrder,
    saved.widgets
  ).page;
}

function normalizePageLayoutForSave(page: DashboardPageState): GridLayoutItem[] {
  const lg = (page.layouts.lg as GridLayoutItem[]).map((item) => snapGridItem(item));
  const dockIds = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );
  const nonDock = lg.filter((item) => !dockIds.has(item.i));
  return layoutWithFlexibleDocks(nonDock, page.widgetInstances);
}

export function pagesToSavePayload(pages: DashboardPageState[]) {
  return pages
    .slice()
    .sort((a, b) => a.pageOrder - b.pageOrder)
    .map((page) => {
      const normalized = normalizePageLayoutForSave(page);
      const widgets = normalized.map((item, index) => {
          const inst = page.widgetInstances.find((w) => w.id === item.i);
          const size =
            inst && isDockSize(inst.size)
              ? inst.size
              : deriveContentTierFromGrid(
                  inst?.type ?? item.i,
                  item.w,
                  item.h,
                  inst?.size
                );
          return {
            widgetId: item.i,
            widgetType: inst?.type,
            config: inst?.config,
            layoutConfig: {
              position: { x: item.x, y: item.y, w: item.w, h: item.h },
              size,
            },
            displayOrder: index,
            isVisible: true,
          };
        });
      return {
        id: isPersistedPageId(page.id) ? page.id : undefined,
        name: page.name,
        pageOrder: page.pageOrder,
        widgets,
      };
    });
}

function nonDockItemsFromLayout(
  page: DashboardPageState,
  lg: GridLayoutItem[]
): GridLayoutItem[] {
  const dockIds = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );
  return lg.filter((item) => !dockIds.has(item.i));
}

export function applyWidgetSizeToPage(
  page: DashboardPageState,
  widgetId: string,
  newSize: WidgetSize
): DashboardPageState | null {
  const item = (page.layouts.lg as GridLayoutItem[]).find((i) => i.i === widgetId);
  if (!item) return null;

  const widget = page.widgetInstances.find((w) => w.id === widgetId);
  const isUndock = Boolean(widget && isDockSize(widget.size) && !isDockSize(newSize));

  // Menu dock selection applies preset geometry. Undock keeps live grid w/h (including
  // flex-shrunk dock dimensions). Free-form grip resize also keeps arbitrary w/h.
  const resizedItem = isUndock
    ? snapGridItem(clampFreeLayoutItem(item))
    : snapGridItem(applySizeToLayoutItem(item, newSize));
  const effectiveSize: WidgetSize = isUndock
    ? contentTierForUndock(widget!.size, widget!.type, resizedItem.w, resizedItem.h)
    : newSize;

  const lgWithResized = (page.layouts.lg as GridLayoutItem[]).map((it) =>
    it.i === widgetId ? resizedItem : it
  );

  const pageWithNewSize: DashboardPageState = {
    ...page,
    widgetInstances: page.widgetInstances.map((w) =>
      w.id === widgetId ? { ...w, size: effectiveSize } : w
    ),
    layouts: { ...page.layouts, lg: lgWithResized },
  };

  const reflowed = layoutWithFlexibleDocks(
    nonDockItemsFromLayout(pageWithNewSize, lgWithResized),
    pageWithNewSize.widgetInstances
  );

  if (
    isDockSize(effectiveSize) &&
    !reflowed.some((c) => c.i === widgetId)
  ) {
    return null;
  }

  if (!validateLayout(reflowed).valid) {
    return null;
  }

  return syncPageWithClampedLayout(pageWithNewSize, reflowed).page;
}

/**
 * Derive the content tier a widget would use at the given grid dimensions.
 * Returns null when the tier matches the widget's committed size.
 */
export function derivePreviewResizeTier(
  widget: { type: string; size: WidgetSize },
  item: GridLayoutItem | undefined
): WidgetSize | null {
  if (!item || isDockSize(widget.size)) {
    return null;
  }
  const nextSize = deriveContentTierFromGrid(
    widget.type,
    item.w,
    item.h,
    widget.size
  );
  return nextSize === widget.size ? null : nextSize;
}

/**
 * During drag-resize: update widget.size content tier only when it crosses a threshold.
 * Returns null when unchanged (caller should skip React state updates).
 */
export function applyPreviewResizeTiersIfChanged(
  page: DashboardPageState,
  newLayouts: { [key: string]: Layout[] },
  resizingWidgetId?: string
): DashboardPageState | null {
  const raw = (newLayouts.lg ?? []) as GridLayoutItem[];
  const dockIds = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );
  const nonDock = raw.filter((item) => !dockIds.has(item.i));
  let tierChanged = false;

  const widgetInstances = page.widgetInstances.map((w) => {
    if (resizingWidgetId && w.id !== resizingWidgetId) {
      return w;
    }
    const item = nonDock.find((l) => l.i === w.id);
    const nextSize = derivePreviewResizeTier(w, item);
    if (!nextSize) {
      return w;
    }
    tierChanged = true;
    return { ...w, size: nextSize };
  });

  if (!tierChanged) {
    return null;
  }

  return { ...page, widgetInstances };
}

/** Clamp a free widget's grid item to grid bounds without snapping to preset dimensions. */
export function clampFreeLayoutItem(item: GridLayoutItem): GridLayoutItem {
  return snapGridItem(item);
}

/** Build the free-widget layout that would be committed after a drag/resize gesture. */
export function buildProposedFreeFromGesture(
  liveItem: GridLayoutItem,
  allLayout: GridLayoutItem[],
  page: DashboardPageState
): GridLayoutItem[] {
  const dockIds = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );

  return allLayout
    .filter((item) => !dockIds.has(item.i))
    .map((item) => {
      const source =
        item.i === liveItem.i
          ? {
              ...item,
              x: liveItem.x,
              y: liveItem.y,
              w: liveItem.w,
              h: liveItem.h,
            }
          : item;
      return clampFreeLayoutItem(source);
    });
}

export function isLivePlacementAccepted(
  liveItem: GridLayoutItem,
  allLayout: GridLayoutItem[],
  page: DashboardPageState
): boolean {
  const proposed = buildProposedFreeFromGesture(liveItem, allLayout, page);
  return validateProposedFreeLayout(proposed, page.widgetInstances).accepted;
}

export function applyLayoutsToPage(
  page: DashboardPageState,
  newLayouts: { [key: string]: Layout[] }
): DashboardPageState {
  const lg = (newLayouts.lg ?? []) as GridLayoutItem[];
  const dockIds = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );

  const nonDock: GridLayoutItem[] = [];
  for (const item of lg) {
    if (dockIds.has(item.i)) continue;
    nonDock.push(clampFreeLayoutItem(item));
  }

  const reflowed = layoutWithFlexibleDocks(nonDock, page.widgetInstances);
  return syncPageWithClampedLayout(page, reflowed).page;
}

/** @deprecated Use clampFreeLayoutItem — grid geometry is no longer snapped to presets. */
export function snapFreeLayoutItem(
  item: GridLayoutItem,
  _inst: { type: string; size: WidgetSize }
): GridLayoutItem {
  return clampFreeLayoutItem(item);
}
