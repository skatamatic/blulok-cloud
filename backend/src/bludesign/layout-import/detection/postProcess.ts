/**
 * Post-detection ingest heuristics.
 *
 * After OCR, prune candidates that are unlikely to be storage units:
 *  - no readable label
 *  - circle-like shapes (low rectangle fill ratio)
 *  - outliers much smaller than the typical unit footprint
 *
 * with one rescue: a labeled, borderline-fill box that abuts a kept unit at
 * similar size is part of the unit fabric (hatching/text inside a real cell
 * lowers its fill score) and is kept rather than dropped.
 */

import type { DetectedUnitCandidate } from '../types';

/** Minimum contour/minAreaRect fill to count as a rectangle (not a circle/blob). */
export const MIN_RECTANGLE_FILL = 0.82;

/** When the bounding box is nearly square, circles sit below this fill ratio (~π/4). */
export const MIN_SQUAREISH_FILL = 0.85;

/** Drop shapes smaller than this fraction of the median unit area. */
export const MIN_RELATIVE_AREA = 0.25;

/** Minimum fill for a labeled borderline box to be eligible for neighbor rescue. */
export const MIN_RESCUE_FILL = 0.7;

function unitArea(u: DetectedUnitCandidate): number {
  return u.bounds.width * u.bounds.height;
}

/** True when the contour looks like a proper rectangle rather than a circle/ blob. */
export function isRectangleLike(u: DetectedUnitCandidate): boolean {
  const { width, height } = u.bounds;
  const fill = u.detectionConfidence;
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));

  if (fill < MIN_RECTANGLE_FILL) return false;
  if (aspect < 1.25 && fill < MIN_SQUAREISH_FILL) return false;
  return true;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Rotation-aware axis-aligned bounding box. */
function aabbOf(u: DetectedUnitCandidate) {
  const c = Math.abs(Math.cos(u.rotationRad));
  const s = Math.abs(Math.sin(u.rotationRad));
  const w = u.bounds.width * c + u.bounds.height * s;
  const h = u.bounds.width * s + u.bounds.height * c;
  return { x: u.bounds.cx - w / 2, y: u.bounds.cy - h / 2, w, h };
}

/** Axis-aligned edge gap between two units; ≤0 means touching/overlapping. */
function edgeGap(a: DetectedUnitCandidate, b: DetectedUnitCandidate): number {
  const A = aabbOf(a);
  const B = aabbOf(b);
  const dx = Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w);
  const dy = Math.max(A.y, B.y) - Math.min(A.y + A.h, B.y + B.h);
  return Math.max(dx, dy);
}

/**
 * A labeled borderline box is rescued when it's clearly part of the unit
 * fabric: it abuts a kept unit and is about the same size. Real cells
 * sometimes score low fill (hatching, text over the cell, a wedge-shaped end
 * cell), but they always share a wall with neighbors — whereas bollards and
 * map symbols float in the aisle and are far smaller than any adjacent unit.
 */
function isRescuableNeighbor(
  candidate: DetectedUnitCandidate,
  kept: DetectedUnitCandidate[]
): boolean {
  if (!(candidate.label ?? '').trim()) return false;
  if (candidate.detectionConfidence < MIN_RESCUE_FILL) return false;
  const area = unitArea(candidate);
  for (const k of kept) {
    if (edgeGap(candidate, k) > 2) continue;
    const ratio = area / Math.max(1, unitArea(k));
    if (ratio >= 0.5 && ratio <= 2) return true;
  }
  return false;
}

/**
 * Apply ingest heuristics to detected units. Returns kept units and warnings
 * describing what was removed.
 */
export function filterDetectedUnits(
  units: DetectedUnitCandidate[]
): { kept: DetectedUnitCandidate[]; warnings: string[] } {
  const warnings: string[] = [];
  let working = units;

  const noLabel = working.filter((u) => !(u.label ?? '').trim());
  if (noLabel.length > 0) {
    warnings.push(`Dropped ${noLabel.length} shape(s) with no readable label`);
    working = working.filter((u) => (u.label ?? '').trim());
  }

  const rectLike = working.filter((u) => isRectangleLike(u));
  const borderline = working.filter((u) => !isRectangleLike(u));
  const rescued = borderline.filter((u) => isRescuableNeighbor(u, rectLike));
  const nonRect = borderline.length - rescued.length;
  if (rescued.length > 0) {
    warnings.push(
      `Rescued ${rescued.length} labeled borderline cell(s) adjoining kept units`
    );
  }
  if (nonRect > 0) {
    warnings.push(`Dropped ${nonRect} non-rectangular shape(s) (e.g. circles)`);
  }
  working = [...rectLike, ...rescued];

  if (working.length >= 3) {
    const med = median(working.map(unitArea));
    const minArea = med * MIN_RELATIVE_AREA;
    const tiny = working.filter((u) => unitArea(u) < minArea);
    if (tiny.length > 0) {
      warnings.push(`Dropped ${tiny.length} shape(s) much smaller than typical units`);
      working = working.filter((u) => unitArea(u) >= minArea);
    }
  }

  // Everything kept is a labeled unit.
  working = working.map((u) => ({ ...u, kind: 'unit' as const }));

  return { kept: working, warnings };
}
