import { WidgetSize, WIDGET_REGISTRY } from '@/types/widget.types';
import { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';

/**
 * Centralized widget size to grid dimensions mapping
 * Grid uses GRID_ROWS (6) x 12 columns — dashboard never scrolls.
 */
export const WIDGET_SIZE_TO_GRID: Record<WidgetSize, { w: number; h: number }> = {
  'tiny': { w: 1, h: 1 },
  'small': { w: 2, h: 2 },
  'medium': { w: 3, h: 2 },
  'medium-tall': { w: 3, h: 3 },
  'large': { w: 4, h: 3 },
  'huge': { w: 6, h: 4 },
  'large-wide': { w: 6, h: 3 },
  'huge-wide': { w: 9, h: 4 },
  'mega-tall': { w: 3, h: 6 },
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

export function allowedSizesForWidget(
  widgetType: string,
  currentSize: WidgetSize
): WidgetSize[] {
  const def = WIDGET_REGISTRY[widgetType as keyof typeof WIDGET_REGISTRY];
  const base = def?.availableSizes ?? [currentSize];
  if (base.includes(currentSize) || !isValidSize(currentSize)) {
    return base;
  }
  return [...base, currentSize];
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
