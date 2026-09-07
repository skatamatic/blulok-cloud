/**
 * Detection metrics for the test harness.
 *
 * Compares detected unit candidates against hand-labeled ground truth using
 * rotated-rect IoU and greedy one-to-one matching, then reports the standard
 * object-detection numbers (precision/recall/F1), label-read accuracy over
 * matched pairs, and a raw count delta. Pure — no OpenCV — so it runs in the
 * fast default Jest suite.
 */

import { rotatedRectIoU } from './geometry';
import type { DetectedUnitCandidate, RotatedRectPx } from './types';

/** A single hand-labeled expected unit. */
export interface GroundTruthUnit {
  bounds: RotatedRectPx;
  rotationRad: number;
  /** Expected label, normalized the same way OCR output is. Optional. */
  label?: string;
}

export interface DetectionMetrics {
  /** IoU threshold used for matching. */
  iouThreshold: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Matched pairs where both sides have a label. */
  labelEvaluated: number;
  /** Matched pairs whose detected label equals the ground-truth label. */
  labelCorrect: number;
  /** labelCorrect / labelEvaluated (1 when nothing to evaluate). */
  labelAccuracy: number;
  /** detectedCount - groundTruthCount. */
  countDelta: number;
  detectedCount: number;
  groundTruthCount: number;
  /** Mean IoU of matched pairs (0 when none matched). */
  meanMatchedIoU: number;
}

interface Pair {
  d: number;
  g: number;
  iou: number;
}

/**
 * Compute detection metrics. Matching is greedy by descending IoU: the
 * highest-IoU detection/ground-truth pair above threshold is matched first,
 * then both are removed from the pool, etc. This is the standard, stable greedy
 * assignment used for detection benchmarks.
 */
export function computeDetectionMetrics(
  detected: DetectedUnitCandidate[],
  groundTruth: GroundTruthUnit[],
  iouThreshold = 0.5
): DetectionMetrics {
  const pairs: Pair[] = [];
  for (let d = 0; d < detected.length; d++) {
    for (let g = 0; g < groundTruth.length; g++) {
      const iou = rotatedRectIoU(
        detected[d].bounds,
        detected[d].rotationRad,
        groundTruth[g].bounds,
        groundTruth[g].rotationRad
      );
      if (iou >= iouThreshold) {
        pairs.push({ d, g, iou });
      }
    }
  }
  pairs.sort((a, b) => b.iou - a.iou);

  const usedD = new Set<number>();
  const usedG = new Set<number>();
  const matches: Pair[] = [];
  for (const p of pairs) {
    if (usedD.has(p.d) || usedG.has(p.g)) continue;
    usedD.add(p.d);
    usedG.add(p.g);
    matches.push(p);
  }

  const truePositives = matches.length;
  const falsePositives = detected.length - truePositives;
  const falseNegatives = groundTruth.length - truePositives;

  const precision =
    detected.length > 0 ? truePositives / detected.length : 0;
  const recall =
    groundTruth.length > 0 ? truePositives / groundTruth.length : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  let labelEvaluated = 0;
  let labelCorrect = 0;
  for (const m of matches) {
    const gtLabel = groundTruth[m.g].label;
    if (gtLabel != null && gtLabel !== '') {
      labelEvaluated++;
      if (detected[m.d].label === gtLabel) {
        labelCorrect++;
      }
    }
  }
  const labelAccuracy = labelEvaluated > 0 ? labelCorrect / labelEvaluated : 1;

  const meanMatchedIoU =
    matches.length > 0
      ? matches.reduce((s, m) => s + m.iou, 0) / matches.length
      : 0;

  return {
    iouThreshold,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    labelEvaluated,
    labelCorrect,
    labelAccuracy,
    countDelta: detected.length - groundTruth.length,
    detectedCount: detected.length,
    groundTruthCount: groundTruth.length,
    meanMatchedIoU,
  };
}
