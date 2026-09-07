import { WidgetLayout } from '@/components/Widget/WidgetGrid';
import { DashboardPageState } from '@/types/widget-management.types';
import { WidgetSize } from '@/types/widget.types';
import {
  deriveContentTierFromGrid,
} from '@/utils/widget-size.utils';
import {
  GridLayoutItem,
  GRID_ROWS,
  isDockSize,
  enrichLayoutItemsWithResizeConstraints,
  layoutWithFlexibleDocks,
  snapGridItem,
} from '@/utils/dashboard-layout-engine';

export function buildResponsiveLayouts(
  clamped: GridLayoutItem[],
  instances?: Array<{ id: string; type: string; size: WidgetSize }>
): {
  lg: WidgetLayout[];
  md: WidgetLayout[];
  sm: WidgetLayout[];
} {
  const lg = instances
    ? enrichLayoutItemsWithResizeConstraints(clamped, instances)
    : clamped;

  return {
    lg,
    md: lg.map((item) => {
      const w = Math.min(item.w, 10);
      return {
        ...item,
        w,
        minW: Math.min(item.minW ?? w, w),
      };
    }),
    sm: lg.map((item, index) => {
      const w = 6;
      const h = Math.min(item.h, GRID_ROWS);
      return {
        ...item,
        w,
        x: 0,
        y: Math.min(index, GRID_ROWS - 1),
        h,
        minW: Math.min(item.minW ?? w, w),
        minH: Math.min(item.minH ?? h, h),
      };
    }),
  };
}

export interface SyncLayoutOptions {
  /** During drag-resize: keep live grid w/h, update widget.size content tier only */
  previewResize?: boolean;
}

/** Keep widget instances in sync with clamped grid; drops widgets that no longer fit. */
export function syncPageWithClampedLayout(
  page: DashboardPageState,
  clamped: GridLayoutItem[],
  options?: SyncLayoutOptions
): { page: DashboardPageState; droppedCount: number } {
  const previewResize = options?.previewResize ?? false;
  const dockIdSet = new Set(
    page.widgetInstances.filter((w) => isDockSize(w.size)).map((w) => w.id)
  );

  const nonDockFromClamped = clamped
    .filter((item) => !dockIdSet.has(item.i))
    .map((item) => snapGridItem(item));

  const reflowed = previewResize
    ? clamped.map((item) => snapGridItem(item))
    : layoutWithFlexibleDocks(nonDockFromClamped, page.widgetInstances);

  const clampedIds = new Set(reflowed.map((c) => c.i));
  const droppedCount = page.widgetInstances.filter((w) => !clampedIds.has(w.id)).length;

  const widgetInstances = page.widgetInstances
    .filter((w) => clampedIds.has(w.id))
    .map((w) => {
      const item = reflowed.find((l) => l.i === w.id)!;
      if (isDockSize(w.size)) {
        return { ...w, size: w.size };
      }
      return {
        ...w,
        size: deriveContentTierFromGrid(w.type, item.w, item.h, w.size),
      };
    });

  // Grid cells from reflow are authoritative; size enum is content tier only.
  const lgFinal = reflowed.map((item) => snapGridItem(item));

  return {
    page: {
      ...page,
      widgetInstances,
      layouts: buildResponsiveLayouts(lgFinal, widgetInstances),
    },
    droppedCount,
  };
}

const UUID_PAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for server-issued dashboard page ids (excludes local-* and legacy-main). */
export function isPersistedPageId(pageId: string): boolean {
  return UUID_PAGE_ID.test(pageId);
}
