import { WidgetSize } from '@/types/widget.types';

/**
 * Centralized widget size to grid dimensions mapping
 * This ensures consistency across the entire application
 */
export const WIDGET_SIZE_TO_GRID: Record<WidgetSize, { w: number; h: number }> = {
  'tiny': { w: 1, h: 1 },
  'small': { w: 2, h: 1 },
  'medium': { w: 3, h: 2 },
  'medium-tall': { w: 3, h: 3 },
  'large': { w: 4, h: 3 },
  'huge': { w: 6, h: 4 },
  'large-wide': { w: 6, h: 3 },
  'huge-wide': { w: 9, h: 4 },
};

/**
 * Convert widget size enum to grid dimensions
 */
export function sizeToGrid(size: WidgetSize): { w: number; h: number } {
  return WIDGET_SIZE_TO_GRID[size] || { w: 3, h: 2 }; // Default to medium
}

/**
 * Convert grid dimensions to widget size enum
 * This is used when the user resizes widgets by dragging
 */
export function gridToSize(w: number, h: number): WidgetSize {
  // Find the closest matching size
  const entries = Object.entries(WIDGET_SIZE_TO_GRID) as [WidgetSize, { w: number; h: number }][];
  
  // First try exact match
  const exactMatch = entries.find(([_, dimensions]) => dimensions.w === w && dimensions.h === h);
  if (exactMatch) {
    return exactMatch[0];
  }
  
  // Then try closest match by area
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

/**
 * Get all available widget sizes
 */
export function getAvailableSizes(): WidgetSize[] {
  return Object.keys(WIDGET_SIZE_TO_GRID) as WidgetSize[];
}

/**
 * Check if a size is valid
 */
export function isValidSize(size: string): size is WidgetSize {
  return size in WIDGET_SIZE_TO_GRID;
}


