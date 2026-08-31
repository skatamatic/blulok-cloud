/**
 * Post-detection geometry cleanup: snap-align rows/columns, then assign doors.
 */

import { assignDoors } from './doorAssignment';
import { rectCorners } from './geometry';
import {
  filterUnitsForIngest,
  resolveLabelsFromNeighbors,
} from './labelResolution';
import { snapAlignUnits, type SnapAlignOptions } from './snapAlign';
import type { EditableUnit, ImportPipelineStage } from './types';

export interface PostProcessOptions {
  snap?: SnapAlignOptions;
  /** Number of snap-align passes (default 2). */
  passes?: number;
}

/**
 * OCR labels below this confidence are noise (stray marks read as "1", bollard
 * dots read as "4", …). They are far more damaging than a blank: label
 * resolution treats every label as an anchor and propagates bad numbering
 * through whole rows. Strip them and let neighbor inference refill the gaps.
 */
const MIN_TRUSTED_LABEL_CONFIDENCE = 0.5;

function stripUntrustedLabels(units: EditableUnit[]): EditableUnit[] {
  return units.map((u) => {
    if (u.edited || u.manual) return u;
    if (!u.label || u.labelConfidence >= MIN_TRUSTED_LABEL_CONFIDENCE) return u;
    return { ...u, label: undefined, labelConfidence: 0, kind: 'rectangle' as const };
  });
}

interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

function unitAabb(u: EditableUnit): Aabb {
  const cs = rectCorners(u.bounds, u.rotationRad);
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
}

function intersectionArea(a: Aabb, b: Aabb): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Keep-priority for overlapping duplicates: labeled > confident > large. */
function keepScore(u: EditableUnit): number {
  return (u.label ? 10 : 0) + u.labelConfidence + u.detectionConfidence;
}

/**
 * Drop near-duplicate detections: boxes that heavily overlap (IoU) or are
 * mostly contained inside another box. The detector's NMS misses some of these
 * (different scales / nested contours), and they wreck snap chains and doors.
 */
export function dedupeOverlappingUnits(units: EditableUnit[]): EditableUnit[] {
  const boxes = units.map(unitAabb);
  const drop = new Set<number>();
  const order = units
    .map((_, i) => i)
    .sort((a, b) => keepScore(units[b]) - keepScore(units[a]));

  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (drop.has(i)) continue;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      if (drop.has(j)) continue;
      const inter = intersectionArea(boxes[i], boxes[j]);
      if (inter <= 0) continue;
      const iou = inter / (boxes[i].area + boxes[j].area - inter);
      const containment = inter / Math.min(boxes[i].area, boxes[j].area);
      if (iou > 0.45 || containment > 0.75) drop.add(j);
    }
  }
  return drop.size === 0 ? units : units.filter((_, i) => !drop.has(i));
}

/**
 * Full post-detection cleanup, in dependency order:
 *
 *  1. Strip untrusted OCR labels (noise anchors corrupt label resolution).
 *  2. Drop junk shapes (low fill, tiny outliers) — mirrors backend ingest.
 *  3. De-duplicate overlapping detections.
 *  4. Resolve missing/odd labels from clean neighbors.
 *  5. Snap-align rows/columns (conservative, revert-on-regression).
 *  6. Assign doors on the final geometry.
 */
export function postProcessImportedUnits(
  units: EditableUnit[],
  imageWidth: number,
  imageHeight: number,
  options?: PostProcessOptions
): EditableUnit[] {
  const snapOpts: SnapAlignOptions = { ...options?.snap };
  const passes = options?.passes ?? 2;

  const trusted = stripUntrustedLabels(units);
  const filtered = filterUnitsForIngest(trusted);
  const deduped = dedupeOverlappingUnits(filtered);
  let working = resolveLabelsFromNeighbors(deduped, 5);
  for (let i = 0; i < passes; i++) {
    working = snapAlignUnits(working, snapOpts);
  }
  return assignDoors(working, imageWidth, imageHeight);
}

const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Same cleanup as {@link postProcessImportedUnits}, but yields between major
 * steps so the progress overlay can update.
 */
export async function postProcessImportedUnitsWithProgress(
  units: EditableUnit[],
  imageWidth: number,
  imageHeight: number,
  onStage: (stage: ImportPipelineStage) => void,
  options?: PostProcessOptions
): Promise<EditableUnit[]> {
  const snapOpts: SnapAlignOptions = { ...options?.snap };
  const passes = options?.passes ?? 2;

  onStage('filtering');
  await yieldFrame();
  const trusted = stripUntrustedLabels(units);
  const filtered = filterUnitsForIngest(trusted);
  const deduped = dedupeOverlappingUnits(filtered);

  onStage('labeling');
  await yieldFrame();
  let working = resolveLabelsFromNeighbors(deduped, 5);

  onStage('aligning');
  await yieldFrame();
  for (let i = 0; i < passes; i++) {
    working = snapAlignUnits(working, snapOpts);
  }

  onStage('doors');
  await yieldFrame();
  return assignDoors(working, imageWidth, imageHeight);
}
