/**
 * Build-in-3D Wizard — Scale calibration (pure)
 *
 * Converts the layout-import pixel space into real-world meters. The rest of the
 * wizard (asset dimensions, placement) is driven entirely by the resulting
 * meters-per-pixel value, so this module is the single source of truth for the
 * pixel -> world conversion.
 */

import { feetToMeters, metersToFeet } from '../../core/types';
import type { EditableUnit } from '../types';

export type LengthUnit = 'ft' | 'm';

/** Convert a length in the given unit into meters. */
export function toMeters(value: number, unit: LengthUnit): number {
  return unit === 'ft' ? feetToMeters(value) : value;
}

/**
 * Direct ratio mode: the user states that a measured pixel length equals a real
 * length. Returns meters per pixel (0 when inputs are invalid).
 */
export function metersPerPixelFromRatio(
  realLength: number,
  unit: LengthUnit,
  pixelLength: number
): number {
  if (!(pixelLength > 0) || !(realLength > 0)) return 0;
  return toMeters(realLength, unit) / pixelLength;
}

/**
 * Pick-a-unit mode: the user selects one unit and enters its real width x depth.
 * We average the width and depth ratios (each measured against that unit's local
 * pixel bounds) for a robust estimate.
 */
export function metersPerPixelFromUnit(
  unit: EditableUnit,
  realWidth: number,
  realDepth: number,
  lengthUnit: LengthUnit
): number {
  const wPx = unit.bounds.width;
  const dPx = unit.bounds.height;
  const ratios: number[] = [];
  if (wPx > 0 && realWidth > 0) ratios.push(toMeters(realWidth, lengthUnit) / wPx);
  if (dPx > 0 && realDepth > 0) ratios.push(toMeters(realDepth, lengthUnit) / dPx);
  if (ratios.length === 0) return 0;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Median unit footprint (in feet) for the given scale — used as a sanity readout
 * so the user can confirm the calibration "feels right" before continuing.
 */
export function medianUnitFootprintFeet(
  units: EditableUnit[],
  metersPerPixel: number
): { widthFt: number; depthFt: number } | null {
  if (units.length === 0 || !(metersPerPixel > 0)) return null;
  const widthFt = metersToFeet(median(units.map((u) => u.bounds.width)) * metersPerPixel);
  const depthFt = metersToFeet(median(units.map((u) => u.bounds.height)) * metersPerPixel);
  return { widthFt, depthFt };
}
