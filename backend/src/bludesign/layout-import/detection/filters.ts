/**
 * Detection filtering: turn raw rotated-rect candidates into clean unit
 * candidates by removing noise and duplicates.
 *
 * All pure (no OpenCV) so it runs in the fast default Jest suite. Steps:
 *  1. Region exclusion (legend/summary table).
 *  2. Shape filters: area window, aspect window, rectangle fill ratio.
 *  3. Non-max suppression by rotated-rect IoU.
 */

import { rotatedRectIoU } from '../geometry';
import type { PixelRegion, ResolvedDetectionOptions } from '../types';
import type { RawDetection } from './detectRectangles';

/** True if the detection's center falls inside any excluded region. */
export function isInExcludedRegion(
  detection: RawDetection,
  regions: PixelRegion[]
): boolean {
  const { cx, cy } = detection.bounds;
  return regions.some(
    (r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
  );
}

/**
 * Heuristic legend/summary band: site plans place the legend + unit-count table
 * in the top-left corner. We exclude a conservative top-left box. Tunable via
 * explicit `excludeRegions` when the heuristic is wrong.
 */
export function autoLegendRegion(
  imageWidth: number,
  imageHeight: number
): PixelRegion {
  return {
    x: 0,
    y: 0,
    width: Math.round(imageWidth * 0.3),
    height: Math.round(imageHeight * 0.18),
  };
}

/**
 * HSV saturation (0..1) of a `#rrggbb` color. White/grey/black → ~0; vivid fills
 * → high. Used to tell colored units from black-on-white text/legend regions.
 */
export function hexSaturation(hex: string | undefined): number {
  if (!hex) return 0;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Longer/shorter side ratio (>= 1). */
export function aspectRatio(detection: RawDetection): number {
  const { width, height } = detection.bounds;
  const long = Math.max(width, height);
  const short = Math.max(1e-6, Math.min(width, height));
  return long / short;
}

/**
 * Shape gate: area within [minAreaPx, maxAreaFraction*imageArea], aspect within
 * [minAspect, maxAspect], and rectangle fill ratio >= minRectFillRatio. This is
 * what rejects dots/poles/bollards (too small), the site boundary (too big),
 * thin connector lines (too elongated) and ragged blobs (low fill ratio).
 */
export function passesShapeFilters(
  detection: RawDetection,
  imageWidth: number,
  imageHeight: number,
  options: ResolvedDetectionOptions
): boolean {
  const imageArea = imageWidth * imageHeight;
  const maxArea = imageArea * options.maxAreaFraction;
  if (detection.areaPx < options.minAreaPx) return false;
  if (detection.areaPx > maxArea) return false;

  const aspect = aspectRatio(detection);
  if (aspect < options.minAspect || aspect > options.maxAspect) return false;

  if (detection.fillRatio < options.minRectFillRatio) return false;

  // Colorfulness gate: reject near-white/grey/black regions (title text, legend
  // labels, dimension callouts). Only applied when a fill color was sampled and
  // the threshold is enabled.
  if (
    options.minColorSaturation > 0 &&
    detection.colorHex !== undefined &&
    hexSaturation(detection.colorHex) < options.minColorSaturation
  ) {
    return false;
  }
  return true;
}

/**
 * Greedy non-max suppression by rotated-rect IoU. Keeps the higher-fill-ratio
 * (more rectangle-like) detection when two overlap above the threshold.
 */
export function nonMaxSuppression(
  detections: RawDetection[],
  iouThreshold: number
): RawDetection[] {
  // Sort by a quality score: larger + better-filled first.
  const ordered = detections
    .slice()
    .sort((a, b) => b.fillRatio * b.areaPx - a.fillRatio * a.areaPx);

  const kept: RawDetection[] = [];
  for (const cand of ordered) {
    let suppressed = false;
    for (const k of kept) {
      const iou = rotatedRectIoU(
        cand.bounds,
        cand.rotationRad,
        k.bounds,
        k.rotationRad
      );
      if (iou > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(cand);
  }
  return kept;
}

/** True if `point` lies inside rotated rectangle `det`. */
function containsPoint(det: RawDetection, px: number, py: number): boolean {
  const dx = px - det.bounds.cx;
  const dy = py - det.bounds.cy;
  const cos = Math.cos(-det.rotationRad);
  const sin = Math.sin(-det.rotationRad);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return (
    Math.abs(lx) <= det.bounds.width / 2 && Math.abs(ly) <= det.bounds.height / 2
  );
}

/** Inner/outer area ratio above which the inner is a true nested rectangle. */
const NESTED_RATIO = 0.4;
/** Area-ratio band for a row/group member (vs a much smaller glyph). */
const ROW_MEMBER_RATIO = 0.18;
/** Enclosing this many smaller boxes marks a cluster/group outline (drop it). */
const GROUP_MIN_MEMBERS = 4;

/**
 * Resolve nested detections produced by line/border segmentation.
 *
 * For each box that encloses smaller boxes' centers:
 *  - if an enclosed box is a *substantial* fraction (≥ {@link NESTED_RATIO}) of
 *    it — a genuine nested cell or the inner ring of a thick border — the outer
 *    is redundant, so drop the outer ("innermost wins");
 *  - else if it encloses ≥ 2 medium boxes (≥ {@link ROW_MEMBER_RATIO}) — a single
 *    blob spanning a row/group of cells (seen with the multi-threshold 'cells'
 *    fallback) — drop the outer to keep the finer cells;
 *  - otherwise the enclosed boxes are the printed number's glyphs/fragments, so
 *    drop *them* and keep the cell.
 *
 * This is what stops a cell from being discarded in favor of the tiny box around
 * its own unit number (which previously erased whole bright-filled rows and left
 * only truncated glyph reads).
 */
export function suppressContainers(detections: RawDetection[]): RawDetection[] {
  const drop = new Set<RawDetection>();
  for (const outer of detections) {
    if (drop.has(outer)) continue;
    const inside: RawDetection[] = [];
    let hasNested = false;
    for (const inner of detections) {
      if (inner === outer) continue;
      if (inner.areaPx >= outer.areaPx) continue;
      if (!containsPoint(outer, inner.bounds.cx, inner.bounds.cy)) continue;
      if (inner.areaPx / outer.areaPx >= NESTED_RATIO) {
        hasNested = true;
        break;
      }
      inside.push(inner);
    }
    if (hasNested) {
      drop.add(outer);
      continue;
    }
    const rowMembers = inside.filter(
      (d) => d.areaPx / outer.areaPx >= ROW_MEMBER_RATIO
    );
    // A box enclosing several medium boxes (a row blob) or many small ones (a
    // cluster/group outline) is the redundant container → drop it, keep the cells.
    // Few small enclosed boxes are the printed number's glyphs → drop those.
    if (rowMembers.length >= 2 || inside.length >= GROUP_MIN_MEMBERS) {
      drop.add(outer);
    } else {
      for (const glyph of inside) drop.add(glyph);
    }
  }
  return detections.filter((d) => !drop.has(d));
}

export interface FilterResult {
  kept: RawDetection[];
  warnings: string[];
}

/**
 * Apply region exclusion, shape filters and NMS in sequence, collecting
 * human-readable warnings about what was excluded.
 */
export function applyFilters(
  detections: RawDetection[],
  imageWidth: number,
  imageHeight: number,
  options: ResolvedDetectionOptions
): FilterResult {
  const warnings: string[] = [];

  const regions: PixelRegion[] = [...options.excludeRegions];
  if (options.autoExcludeLegend) {
    regions.push(autoLegendRegion(imageWidth, imageHeight));
  }

  const afterRegion = detections.filter((d) => !isInExcludedRegion(d, regions));
  const regionExcluded = detections.length - afterRegion.length;
  if (regionExcluded > 0) {
    warnings.push(
      `Excluded ${regionExcluded} candidate(s) inside legend/excluded region(s)`
    );
  }

  const afterShape = afterRegion.filter((d) =>
    passesShapeFilters(d, imageWidth, imageHeight, options)
  );
  const shapeExcluded = afterRegion.length - afterShape.length;
  if (shapeExcluded > 0) {
    warnings.push(
      `Rejected ${shapeExcluded} candidate(s) failing area/aspect/fill/color filters`
    );
  }

  const deduped = nonMaxSuppression(afterShape, options.nmsIouThreshold);
  const nmsRemoved = afterShape.length - deduped.length;
  if (nmsRemoved > 0) {
    warnings.push(`Merged ${nmsRemoved} overlapping duplicate detection(s)`);
  }

  const kept = suppressContainers(deduped);
  const containersRemoved = deduped.length - kept.length;
  if (containersRemoved > 0) {
    warnings.push(
      `Resolved ${containersRemoved} nested/glyph detection(s)`
    );
  }

  return { kept, warnings };
}
