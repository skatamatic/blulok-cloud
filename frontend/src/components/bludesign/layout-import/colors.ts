/**
 * BluDesign Layout Import — shared color/format helpers
 *
 * Centralizes the mapping from review state → color so the canvas overlay, unit
 * list and hover card all stay visually consistent.
 *
 * Overlay palette (canvas):
 *  - Normal boxes get a dark-blue border + light-blue fill.
 *  - Error boxes (no label / duplicate label) are drawn in red so problems pop.
 */

import type { EditableUnit } from './types';

export interface OverlayColor {
  /** Solid stroke / accent color. */
  stroke: string;
  /** Translucent fill color (already includes alpha). */
  fill: string;
}

/** Brand blue for labeled storage units. */
export const UNIT_COLOR = '#147FD4';

/** Neutral color for a rectangle with no readable label ("likely not a unit"). */
export const NON_UNIT_COLOR = '#9ca3af'; // gray-400

/** Canvas overlay palette. */
export const OVERLAY_BORDER = '#0b5394'; // dark blue (border)
export const OVERLAY_FILL = '#147FD4'; // light blue (translucent fill)
export const ERROR_COLOR = '#dc2626'; // red (error border/fill)
export const DOOR_COLOR = '#f59e0b'; // amber-500 (door opening marker)

/** True when this candidate is an unlabeled rectangle. */
export function isUnlabeledRectangle(unit: EditableUnit): boolean {
  return unit.kind === 'rectangle';
}

/** List/hover accent for a unit row (blue for units, gray for unlabeled rects). */
export function unitAccentColor(unit: EditableUnit): string {
  return isUnlabeledRectangle(unit) ? NON_UNIT_COLOR : UNIT_COLOR;
}

/**
 * Resolve the canvas overlay color. Errors render red; everything else uses the
 * dark-blue border + light-blue fill scheme.
 */
export function overlayColor(isError: boolean, fillOpacity: number): OverlayColor {
  return isError
    ? { stroke: ERROR_COLOR, fill: hexToRgba(ERROR_COLOR, fillOpacity) }
    : { stroke: OVERLAY_BORDER, fill: hexToRgba(OVERLAY_FILL, fillOpacity) };
}

export type ConfidenceTier = 'high' | 'medium' | 'low';

export function confidenceTier(value: number): ConfidenceTier {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

/** Tailwind text class for a confidence value. */
export function confidenceTextClass(value: number): string {
  switch (confidenceTier(value)) {
    case 'high':
      return 'text-success-500';
    case 'medium':
      return 'text-warning-500';
    case 'low':
      return 'text-error-500';
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const formatPct = (value: number): string => `${Math.round(value * 100)}%`;
