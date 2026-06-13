/**
 * Fast, pure unit tests for the geometry + metrics layer. No image decoding or
 * OpenCV — these run in the default Jest suite and gate the harness math.
 */

import {
  rectCorners,
  polygonArea,
  rotatedRectIntersectionArea,
  rotatedRectIoU,
} from '../geometry';
import { computeDetectionMetrics, type GroundTruthUnit } from '../metrics';
import type { DetectedUnitCandidate } from '../types';

function unit(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot = 0,
  label?: string
): DetectedUnitCandidate {
  return {
    id: `${cx}-${cy}`,
    kind: label ? 'unit' : 'rectangle',
    bounds: { cx, cy, width: w, height: h },
    rotationRad: rot,
    label,
    labelConfidence: label ? 0.9 : 0,
    detectionConfidence: 0.9,
  };
}

function gt(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot = 0,
  label?: string
): GroundTruthUnit {
  return { bounds: { cx, cy, width: w, height: h }, rotationRad: rot, label };
}

describe('geometry', () => {
  it('computes axis-aligned corners with no rotation', () => {
    const corners = rectCorners({ cx: 0, cy: 0, width: 10, height: 4 }, 0);
    expect(corners).toEqual([
      { x: -5, y: -2 },
      { x: 5, y: -2 },
      { x: 5, y: 2 },
      { x: -5, y: 2 },
    ]);
  });

  it('polygonArea matches the rectangle area', () => {
    const corners = rectCorners({ cx: 3, cy: 7, width: 10, height: 4 }, 0);
    expect(polygonArea(corners)).toBeCloseTo(40, 6);
  });

  it('identical rects have IoU 1', () => {
    const r = { cx: 5, cy: 5, width: 10, height: 10 };
    expect(rotatedRectIoU(r, 0, r, 0)).toBeCloseTo(1, 6);
  });

  it('disjoint rects have IoU 0', () => {
    const a = { cx: 0, cy: 0, width: 10, height: 10 };
    const b = { cx: 100, cy: 100, width: 10, height: 10 };
    expect(rotatedRectIoU(a, 0, b, 0)).toBe(0);
  });

  it('half-overlapping equal squares have IoU 1/3', () => {
    // Two 10x10 squares offset by 5 in x → intersection 50, union 150.
    const a = { cx: 0, cy: 0, width: 10, height: 10 };
    const b = { cx: 5, cy: 0, width: 10, height: 10 };
    expect(rotatedRectIntersectionArea(a, 0, b, 0)).toBeCloseTo(50, 4);
    expect(rotatedRectIoU(a, 0, b, 0)).toBeCloseTo(1 / 3, 4);
  });

  it('a 45° rotated square inscribes the same center square correctly', () => {
    // Square of side 10 rotated 45° has diagonal ~14.14; intersection with the
    // axis-aligned 10x10 at the same center is an octagon < 100.
    const a = { cx: 0, cy: 0, width: 10, height: 10 };
    const inter = rotatedRectIntersectionArea(a, 0, a, Math.PI / 4);
    expect(inter).toBeGreaterThan(80);
    expect(inter).toBeLessThan(100);
  });
});

describe('computeDetectionMetrics', () => {
  it('scores a perfect match as precision/recall/f1 = 1', () => {
    const det = [unit(0, 0, 10, 10), unit(50, 0, 10, 10)];
    const truth = [gt(0, 0, 10, 10), gt(50, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth);
    expect(m.truePositives).toBe(2);
    expect(m.falsePositives).toBe(0);
    expect(m.falseNegatives).toBe(0);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
    expect(m.countDelta).toBe(0);
  });

  it('counts a missed unit as a false negative', () => {
    const det = [unit(0, 0, 10, 10)];
    const truth = [gt(0, 0, 10, 10), gt(50, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth);
    expect(m.truePositives).toBe(1);
    expect(m.falseNegatives).toBe(1);
    expect(m.recall).toBe(0.5);
    expect(m.precision).toBe(1);
  });

  it('counts a spurious detection as a false positive', () => {
    const det = [unit(0, 0, 10, 10), unit(999, 999, 10, 10)];
    const truth = [gt(0, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth);
    expect(m.truePositives).toBe(1);
    expect(m.falsePositives).toBe(1);
    expect(m.precision).toBe(0.5);
    expect(m.recall).toBe(1);
    expect(m.countDelta).toBe(1);
  });

  it('does not double-match one ground truth to two detections', () => {
    const det = [unit(0, 0, 10, 10), unit(1, 0, 10, 10)];
    const truth = [gt(0, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth);
    expect(m.truePositives).toBe(1);
    expect(m.falsePositives).toBe(1);
  });

  it('respects the IoU threshold for matching', () => {
    const det = [unit(7, 0, 10, 10)]; // IoU with truth ~ 3/17 < 0.5
    const truth = [gt(0, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth, 0.5);
    expect(m.truePositives).toBe(0);
    expect(m.falsePositives).toBe(1);
    expect(m.falseNegatives).toBe(1);
  });

  it('computes label accuracy only over matched, labeled pairs', () => {
    const det = [
      unit(0, 0, 10, 10, 0, '26'),
      unit(50, 0, 10, 10, 0, '99'), // wrong
    ];
    const truth = [gt(0, 0, 10, 10, 0, '26'), gt(50, 0, 10, 10, 0, '27')];
    const m = computeDetectionMetrics(det, truth);
    expect(m.labelEvaluated).toBe(2);
    expect(m.labelCorrect).toBe(1);
    expect(m.labelAccuracy).toBe(0.5);
  });

  it('label accuracy is 1 when there are no labels to evaluate', () => {
    const det = [unit(0, 0, 10, 10)];
    const truth = [gt(0, 0, 10, 10)];
    const m = computeDetectionMetrics(det, truth);
    expect(m.labelEvaluated).toBe(0);
    expect(m.labelAccuracy).toBe(1);
  });

  it('handles empty inputs without NaNs', () => {
    const m = computeDetectionMetrics([], []);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
    expect(m.labelAccuracy).toBe(1);
    expect(m.meanMatchedIoU).toBe(0);
  });
});
