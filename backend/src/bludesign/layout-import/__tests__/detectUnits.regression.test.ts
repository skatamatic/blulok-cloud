/**
 * Metrics regression for the detection engine.
 *
 * Runs the *real* pipeline (OpenCV + Tesseract) on the sample site plan and
 * scores it against the hand-verified `ground-truth.json`, asserting ratchetable
 * thresholds. This is heavy (WASM init + OCR over ~80 crops) and therefore
 * EXCLUDED from the default Jest run via `testPathIgnorePatterns`; invoke it
 * explicitly with `npm run bludesign:detect:test`.
 *
 * Ratcheting policy: thresholds are set just below the current measured
 * baseline. As the engine improves, raise them — never lower them or edit ground
 * truth to make a regression pass (see the fixtures README).
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectUnits } from '../detectUnits';
import { computeDetectionMetrics, type GroundTruthUnit } from '../metrics';

const FIXTURES = path.join(__dirname, 'fixtures');
const IMAGE = path.join(FIXTURES, 'test_site_layout.png');
const GROUND_TRUTH = path.join(FIXTURES, 'ground-truth.json');

interface GroundTruthFile {
  imageWidth: number;
  imageHeight: number;
  /** Known true number of door cells on the sample plan (from its legend). */
  trueDoorCount: number;
  units: GroundTruthUnit[];
}

// Ratchetable thresholds.
//
// `ground-truth.json` pairs the detector's box GEOMETRY on the full-resolution
// `test_site_layout.png` (2133×532) with VISION-VERIFIED labels (every cell was
// read by hand — see fixtures/README.md). Geometry is therefore self-consistent
// (recall/precision are floors that catch geometry drift), but labelAccuracy is
// a REAL measure of OCR correctness against the true unit numbers: after the
// multi-scale voting + glyph-respacing OCR pass, 139 of 141 labeled boxes read
// correctly (~0.986). The two residual misreads are the italic trailing-1↔7
// font ambiguity (111→117, 101→107) where every page-seg mode agrees on the
// wrong glyph — these are corrected downstream by neighbor sequence repair.
// The real-world anchor is the door count: the legend says 145 and the
// detector emits exactly 145 labeled door cells (the neighbor-rescue ingest
// rule recovers borderline-fill cells like 99/124/127/27A that abut kept
// units). Raise thresholds as the OCR converges — never lower them or edit
// ground truth to pass.
const THRESHOLDS = {
  recall: 0.97,
  precision: 0.97,
  labelAccuracy: 0.97,
  iou: 0.5,
  doorCountTolerance: 2,
};

describe('detectUnits regression vs ground truth', () => {
  it(
    'meets detection + label thresholds on the sample plan',
    async () => {
      const buffer = fs.readFileSync(IMAGE);
      const truth: GroundTruthFile = JSON.parse(
        fs.readFileSync(GROUND_TRUTH, 'utf8')
      );

      const result = await detectUnits(buffer);
      const metrics = computeDetectionMetrics(
        result.units,
        truth.units,
        THRESHOLDS.iou
      );

      // Always dump metrics so a failure is immediately triageable.

      const doorCountDelta = Math.abs(
        metrics.detectedCount - truth.trueDoorCount
      );

      console.log(
        '[regression] metrics:',
        JSON.stringify(
          {
            detected: metrics.detectedCount,
            groundTruth: metrics.groundTruthCount,
            trueDoorCount: truth.trueDoorCount,
            doorCountDelta,
            precision: +metrics.precision.toFixed(3),
            recall: +metrics.recall.toFixed(3),
            f1: +metrics.f1.toFixed(3),
            labelEvaluated: metrics.labelEvaluated,
            labelCorrect: metrics.labelCorrect,
            labelAccuracy: +metrics.labelAccuracy.toFixed(3),
            meanMatchedIoU: +metrics.meanMatchedIoU.toFixed(3),
          },
          null,
          2
        )
      );

      expect(result.imageWidth).toBe(truth.imageWidth);
      expect(result.imageHeight).toBe(truth.imageHeight);
      expect(metrics.recall).toBeGreaterThanOrEqual(THRESHOLDS.recall);
      expect(metrics.precision).toBeGreaterThanOrEqual(THRESHOLDS.precision);
      expect(metrics.labelAccuracy).toBeGreaterThanOrEqual(
        THRESHOLDS.labelAccuracy
      );
      // Track the real-world door target, not just self-consistency with the
      // bootstrapped boxes.
      expect(doorCountDelta).toBeLessThanOrEqual(THRESHOLDS.doorCountTolerance);
    },
    180_000
  );
});
