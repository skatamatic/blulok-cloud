import { getWidgetType } from '@/config/widgetRegistry';
import { WidgetSize } from '@/types/widget.types';
import { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';

export const WIDGET_SIZE_TO_GRID: Record<WidgetSize, { w: number; h: number }> = {
  'tiny': { w: 1, h: 1 },
  'small': { w: 2, h: 2 },
  'medium': { w: 3, h: 2 },
  'medium-tall': { w: 3, h: 3 },
  'large': { w: 4, h: 3 },
  'huge': { w: 6, h: 4 },
  'large-wide': { w: 6, h: 3 },
  'huge-wide': { w: 9, h: 4 },
  'mega-tall': { w: 3, h: GRID_ROWS },
  'dock-top': { w: 12, h: 3 },
  'dock-bottom': { w: 12, h: 3 },
  'dock-left': { w: 6, h: GRID_ROWS },
  'dock-right': { w: 6, h: GRID_ROWS },
  'dock-bottom-two-thirds': { w: 12, h: 4 },
  'dock-full': { w: 12, h: GRID_ROWS },
};

export function sizeToGrid(size: WidgetSize): { w: number; h: number } {
  return WIDGET_SIZE_TO_GRID[size] || { w: 3, h: 2 };
}

export function gridToSize(w: number, h: number): WidgetSize {
  const entries = Object.entries(WIDGET_SIZE_TO_GRID) as [WidgetSize, { w: number; h: number }][];

  const exactMatch = entries.find(([, dimensions]) => dimensions.w === w && dimensions.h === h);
  if (exactMatch) {
    return exactMatch[0];
  }

  const area = w * h;
  const closest = entries.reduce((closest, [size, dimensions]) => {
    const currentArea = dimensions.w * dimensions.h;
    const closestArea = WIDGET_SIZE_TO_GRID[closest].w * WIDGET_SIZE_TO_GRID[closest].h;

    const currentDiff = Math.abs(currentArea - area);
    const closestDiff = Math.abs(closestArea - area);

    return currentDiff < closestDiff ? size : closest;
  }, 'medium' as WidgetSize);

  return closest;
}

export function getAvailableSizes(): WidgetSize[] {
  return Object.keys(WIDGET_SIZE_TO_GRID) as WidgetSize[];
}

export function isValidSize(size: string): size is WidgetSize {
  return size in WIDGET_SIZE_TO_GRID;
}

/** Dock presets are opt-in via the widget menu — never inferred from grid dimensions. */
export function isDockSize(size: WidgetSize): boolean {
  return (size as string).startsWith('dock-');
}

/** Non-dock content tiers allowed for a widget type (for resize / UI layout). */
export function standardSizesForWidget(
  widgetType: string,
  currentSize?: WidgetSize
): WidgetSize[] {
  const fallback =
    currentSize && !isDockSize(currentSize) ? currentSize : ('medium' as WidgetSize);
  return allowedSizesForWidget(widgetType, fallback).filter((s) => !isDockSize(s));
}

/** Registry allowed sizes plus the widget's current size (preserves persisted dock-full). */
export function allowedSizesForWidget(
  widgetType: string,
  currentSize: WidgetSize
): WidgetSize[] {
  const def = getWidgetType(widgetType);
  const base = def?.availableSizes ?? [currentSize];
  if (base.includes(currentSize) || !isValidSize(currentSize)) {
    return base;
  }
  return [...base, currentSize];
}

function gridArea(size: WidgetSize): number {
  const { w, h } = sizeToGrid(size);
  return w * h;
}

/** Try preferred size first, then progressively smaller allowed presets. */
export function orderSizesForPlacement(
  preferredSize: WidgetSize,
  allowedSizes: WidgetSize[]
): WidgetSize[] {
  const unique = [...new Set(allowedSizes.filter((s) => isValidSize(s)))];
  const rest = unique
    .filter((s) => s !== preferredSize)
    .sort((a, b) => gridArea(a) - gridArea(b));
  if (unique.includes(preferredSize)) {
    return [preferredSize, ...rest];
  }
  return rest;
}

function dimensionDistance(
  w: number,
  h: number,
  size: WidgetSize
): number {
  const g = sizeToGrid(size);
  return Math.abs(g.w - w) + Math.abs(g.h - h);
}

/** Map a dock preset to the standard content tier that matches its interior layout. */
const DOCK_UNDOCK_CONTENT_TIER: Partial<Record<WidgetSize, WidgetSize>> = {
  'dock-top': 'large-wide',
  'dock-bottom': 'large-wide',
  'dock-bottom-two-thirds': 'huge-wide',
  'dock-left': 'mega-tall',
  'dock-right': 'mega-tall',
  'dock-full': 'huge-wide',
};

/**
 * Pick a content tier when leaving a dock preset. Preserves the dock's interior
 * layout intent rather than snapping purely to nearest grid dimensions.
 */
export function contentTierForUndock(
  fromDockSize: WidgetSize,
  widgetType: string,
  w: number,
  h: number
): WidgetSize {
  const mapped = DOCK_UNDOCK_CONTENT_TIER[fromDockSize];
  const allowed = standardSizesForWidget(widgetType);
  if (mapped && allowed.includes(mapped)) {
    return mapped;
  }
  if (mapped && isValidSize(mapped)) {
    return mapped;
  }
  return deriveContentTierFromGrid(widgetType, w, h);
}

function isDockShapedFreeGrid(w: number, h: number): boolean {
  return (
    (w >= 10 && h <= 3) ||
    (w >= 10 && h === 4) ||
    (w >= 10 && h >= 5) ||
    (w <= 6 && h >= 5)
  );
}

/**
 * Map live grid w/h to the nearest content-tier enum for a widget type.
 * Tier labels drive in-widget layout (compact vs expanded UI), not grid geometry.
 */
export function deriveContentTierFromGrid(
  widgetType: string,
  w: number,
  h: number,
  currentSize?: WidgetSize
): WidgetSize {
  if (currentSize && isDockSize(currentSize)) {
    return currentSize;
  }
  const standard = standardSizesForWidget(widgetType, currentSize);
  if (standard.length === 0) {
    return currentSize ?? ('medium' as WidgetSize);
  }
  // Keep an explicit standard tier while grid still matches a dock-shaped footprint
  // (e.g. after undock at 12×3 — interior layout stays dock-like until reshaped).
  if (
    currentSize &&
    standard.includes(currentSize) &&
    isDockShapedFreeGrid(w, h)
  ) {
    return currentSize;
  }
  return snapGridToAllowedSize(w, h, standard);
}

/** Map grid cell dimensions to the nearest allowed widget preset. */
export function snapGridToAllowedSize(
  w: number,
  h: number,
  allowedSizes: WidgetSize[]
): WidgetSize {
  const allowed = [...new Set(allowedSizes.filter((s) => isValidSize(s)))];
  if (allowed.length === 0) {
    return gridToSize(w, h);
  }

  const exact = allowed.find((size) => {
    const g = sizeToGrid(size);
    return g.w === w && g.h === h;
  });
  if (exact) return exact;

  const targetArea = w * h;
  return allowed.reduce((best, size) => {
    const bestDist = dimensionDistance(w, h, best);
    const sizeDist = dimensionDistance(w, h, size);
    if (sizeDist !== bestDist) {
      return sizeDist < bestDist ? size : best;
    }
    const bestAreaDiff = Math.abs(gridArea(best) - targetArea);
    const sizeAreaDiff = Math.abs(gridArea(size) - targetArea);
    return sizeAreaDiff < bestAreaDiff ? size : best;
  }, allowed[0]);
}

/** Min preset span + full grid max (resize is not capped to largest allowed preset). */
export function gridBoundsForAllowedSizes(allowedSizes: WidgetSize[]): {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
} {
  const grids = allowedSizes
    .filter((s) => isValidSize(s))
    .map((s) => sizeToGrid(s));

  if (grids.length === 0) {
    return { minW: 1, minH: 1, maxW: GRID_COLS, maxH: GRID_ROWS };
  }

  return {
    minW: Math.min(...grids.map((g) => g.w)),
    minH: Math.min(...grids.map((g) => g.h)),
    maxW: GRID_COLS,
    maxH: GRID_ROWS,
  };
}
