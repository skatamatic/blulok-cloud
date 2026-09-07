# Layout-import detection fixtures

This directory holds the inputs for the BluDesign layout-detection test harness.

## Files

- `test_site_layout.png` — a real facility site plan at full resolution
  (**2133×532**: colored storage units with printed numbers, a legend +
  unit-count table top-left, poles/bollards drawn as dots). This is the primary
  regression fixture. (An earlier 1024×255 downsample, `sample-overnight-parking.png`,
  was removed — at half the linear resolution the printed numbers lost ~75% of
  their pixels and OCR could not read them; always test at native resolution.)
- `ground-truth.json` — expected detections for the sample image. Each entry is a
  rotated rectangle in **pixel space** (image top-left origin) plus the expected
  label. `trueDoorCount` records the real number of door cells from the plan's
  legend (the regression asserts the detected count stays within tolerance of it):
- `detection-result.json` — committed snapshot of the engine's actual output on
  the sample plan (same shape as the CLI's `result.json`). Consumed by the
  frontend's `labelPipeline.regression.test.ts`, which runs the full frontend
  post-processing pipeline (strip → ingest → dedupe → resolution → snap) on it
  and asserts labels against `ground-truth.json` — guarding the seam where
  correct backend reads can still be destroyed downstream. Refresh it together
  with `ground-truth.json` whenever the engine improves.

  ```json
  {
    "imageWidth": 2133,
    "imageHeight": 532,
    "trueDoorCount": 145,
    "units": [
      { "bounds": { "cx": 120, "cy": 200, "width": 22, "height": 30 }, "rotationRad": 0, "label": "12" }
    ]
  }
  ```

### Granularity: door cells, not whole units

The engine detects at **door-cell granularity**. The sample legend totals **95
units / 145 doors** (a two-door unit is one unit but two adjacent door cells, etc.),
and the drawn rectangles the detector recovers are the **door cells**, so the
target detection count is **145**, not 95. A later wizard phase groups door cells
back into multi-door units with the human in the loop.

## How `ground-truth.json` was bootstrapped

The visual CLI doubles as the labeling aid. The workflow is:

1. Run the detector and emit candidate boxes + an annotated overlay:

   ```bash
   npm run bludesign:detect -- \
     src/bludesign/layout-import/__tests__/fixtures/test_site_layout.png \
     ./tmp/detect-out
   ```

   This writes `annotated.png` (rotated rects colored by confidence, labeled by
   index) and `result.json` (the raw `LayoutImportDetectionResult`).

2. Open `annotated.png` next to the source plan and hand-correct `result.json`
   into ground truth: drop false positives, add any missed units, and fix labels
   the OCR misread. Save the curated result as `ground-truth.json` here (keep
   `bounds`, `rotationRad`, and `label`; other fields are ignored by metrics).

3. Re-run the regression test to score the current engine against the curated
   truth:

   ```bash
   npm run bludesign:detect:test
   ```

## Updating ground truth

Only edit `ground-truth.json` when the **source image** changes or a genuine
labeling error is found — never to make a failing detector pass. The regression
thresholds are meant to ratchet up as the engine improves; loosening them or
editing truth to match a regression defeats the harness.

## Current state: re-bootstrapped snapshot with vision-verified labels

`ground-truth.json` is a snapshot of the detector's geometry on
`test_site_layout.png` (2133×532) with **labels verified by hand** (every cell
was read against the plan; the two labels the engine still misreads — 111 and
101, both the italic trailing-1↔7 ambiguity — are stored with their TRUE
values). The detector emits **141 labeled door cells** against the legend's
145 (`doorCountTolerance` 8), with labelAccuracy ~0.986. Unlabeled rectangles
(bollards, artifacts) are dropped at ingest and no longer appear in the truth.

The OCR pipeline that achieved this (see `ocr/`): per-cell de-rotated Value
crops with ink localization and wall-hairline removal, multi-page-seg voting
(block/line/word + 2× block) with support-weighted label election, a stacked
"26/A" two-row re-typeset, and a re-spaced glyph fallback for kerning-merged
digits ("71" → "n"). The remaining 1↔7 misreads are corrected downstream by
neighbor sequence repair in the frontend.

Re-bootstrap the snapshot whenever the model improves: regenerate
`result.json` via the CLI, carry verified labels over by geometric match, and
ratchet the `detectUnits.regression.test.ts` thresholds up — never down.
