/**
 * Detection orchestrator.
 *
 * Wires the pipeline end to end: decode → internal upscale → segmentation
 * (cell-grid by default, color mask optionally) → rectangle detection →
 * filtering/NMS → per-unit OCR, returning a pixel-space
 * `LayoutImportDetectionResult`. Deterministic given pinned dependency versions
 * and the vendored language data.
 *
 * Geometry is computed on the upscaled working image (so thin separators
 * survive) and mapped back to source pixel space before filtering and output —
 * the public contract is always in source pixels.
 *
 * OCR is injectable via `deps.ocrProvider` so tests can run the geometry path
 * without the WASM Tesseract worker. When `options.runOcr` is true and no
 * provider is supplied, a `TesseractOcrProvider` is created and torn down within
 * the call.
 */

import { getCv } from './opencv';
import type { CvModule } from './opencv';
import { decodeImage } from './image/decodeImage';
import type { DecodedImage } from './image/decodeImage';
import {
  toRgbaMat,
  toGray,
  valueChannel,
  colorMask,
  cellMask,
  borderMask,
  upscaleToWidth,
} from './image/preprocess';
import { detectRectangles } from './detection/detectRectangles';
import type { RawDetection } from './detection/detectRectangles';
import { applyFilters, aspectRatio } from './detection/filters';
import { filterDetectedUnits } from './detection/postProcess';
import { readUnitLabel } from './ocr/readLabel';
import { createDefaultOcrProvider } from './ocr/ocrLabels';
import type { OcrProvider } from './ocr/ocrLabels';
import {
  resolveDetectionOptions,
  type DetectionOptions,
  type DetectionEventSink,
  type DetectedUnitCandidate,
  type LayoutImportDetectionResult,
} from './types';

export interface DetectUnitsDeps {
  /** OpenCV module override (defaults to the cached WASM runtime). */
  cv?: CvModule;
  /** OCR backend override (defaults to a transient TesseractOcrProvider). */
  ocrProvider?: OcrProvider;
  /**
   * Optional progress/discovery sink. When supplied, the engine emits stage,
   * rectangle, per-unit and progress events so a transport can stream them.
   * Never awaited; keep handlers cheap. `done`/`error` are the transport's job.
   */
  onEvent?: DetectionEventSink;
}

/** Infer a 1..4 door-count hint from the unit's long/short aspect ratio. */
export function doorCountHintFromAspect(aspect: number): 1 | 2 | 3 | 4 {
  const n = Math.round(aspect);
  return Math.max(1, Math.min(4, n)) as 1 | 2 | 3 | 4;
}

/** Divide a raw detection's geometry by `scale` (working space → source space). */
function scaleDown(det: RawDetection, scale: number): RawDetection {
  if (scale === 1) return det;
  return {
    bounds: {
      cx: det.bounds.cx / scale,
      cy: det.bounds.cy / scale,
      width: det.bounds.width / scale,
      height: det.bounds.height / scale,
    },
    rotationRad: det.rotationRad,
    fillRatio: det.fillRatio,
    areaPx: det.areaPx / (scale * scale),
    colorHex: det.colorHex,
  };
}

/**
 * Run detection on an encoded image buffer or already-decoded image.
 */
export async function detectUnits(
  input: Buffer | DecodedImage,
  options?: DetectionOptions,
  deps: DetectUnitsDeps = {}
): Promise<LayoutImportDetectionResult> {
  const opts = resolveDetectionOptions(options);
  const emit: DetectionEventSink = deps.onEvent ?? (() => {});

  emit({ type: 'stage', stage: 'decoding' });
  const decoded: DecodedImage = Buffer.isBuffer(input)
    ? await decodeImage(input)
    : input;
  const cv: CvModule = deps.cv ?? (await getCv());

  const warnings: string[] = [];
  const units: DetectedUnitCandidate[] = [];

  // Mats we must always release.
  const rgbaOrig = toRgbaMat(cv, decoded);
  let work: any = null;
  let gray: any = null;
  let mask: any = null;
  // Native-resolution Value channel (max RGB) is the OCR crop source: it keeps
  // black digits black on a white field for any fill color, and cropping at
  // native res avoids the double-upscale blur the detection working image has.
  let ocrSource: any = null;

  // OCR provider lifecycle: only create+terminate our own if one wasn't injected.
  let ownProvider: OcrProvider | null = null;
  const provider: OcrProvider | null = opts.runOcr
    ? deps.ocrProvider ?? (ownProvider = createDefaultOcrProvider())
    : null;

  try {
    emit({ type: 'stage', stage: 'preprocessing' });
    const upscaled = upscaleToWidth(cv, rgbaOrig, opts.internalUpscaleTargetWidth);
    work = upscaled.mat;
    const scale = upscaled.scale;
    if (scale > 1) {
      warnings.push(`Image upscaled ${scale}× internally for detection`);
    }

    gray = toGray(cv, work);

    emit({ type: 'stage', stage: 'detecting' });

    // Collect raw detections (in source pixel space) from the chosen strategy.
    let raw: RawDetection[] = [];
    const detectPasses =
      opts.segmentation === 'cells' ? opts.cellThresholds.length : 3;
    let detectDone = 0;
    const emitDetectProgress = () => {
      emit({ type: 'progress', done: detectDone, total: detectPasses });
    };

    if (opts.segmentation === 'color') {
      mask = colorMask(cv, work, opts.minSaturation, opts.minValue);
      detectDone = 1;
      emitDetectProgress();
      raw = detectRectangles(cv, mask, work, 'external').map((d) =>
        scaleDown(d, scale)
      );
      detectDone = 2;
      emitDetectProgress();
    } else if (opts.segmentation === 'cells') {
      for (const t of opts.cellThresholds) {
        const m = cellMask(cv, gray, t);
        try {
          const found = detectRectangles(cv, m, work, 'list');
          for (const d of found) raw.push(scaleDown(d, scale));
        } finally {
          m.delete();
        }
        detectDone += 1;
        emitDetectProgress();
      }
    } else {
      mask = borderMask(cv, gray, opts.borderCloseKernel);
      detectDone = 1;
      emitDetectProgress();
      raw = detectRectangles(cv, mask, work, 'list').map((d) =>
        scaleDown(d, scale)
      );
      detectDone = 2;
      emitDetectProgress();
    }

    const filtered = applyFilters(raw, decoded.width, decoded.height, opts);
    detectDone = detectPasses;
    emitDetectProgress();
    warnings.push(...filtered.warnings);

    // Build pending candidates (geometry only) and announce them so the UI can
    // draw every box immediately, before the slow per-rectangle OCR pass.
    const pending: DetectedUnitCandidate[] = filtered.kept.map((det, i) => ({
      id: `u${i}`,
      kind: 'rectangle',
      bounds: det.bounds,
      rotationRad: det.rotationRad,
      labelConfidence: 0,
      detectionConfidence: det.fillRatio,
      doorCountHint: doorCountHintFromAspect(aspectRatio(det)),
      colorHex: det.colorHex,
    }));
    emit({ type: 'rectangles', total: pending.length, units: pending });

    emit({ type: 'stage', stage: 'reading' });

    let unreadable = 0;
    const total = filtered.kept.length;
    for (let i = 0; i < total; i++) {
      const det = filtered.kept[i];
      const candidate = pending[i];

      if (provider) {
        try {
          if (!ocrSource) {
            ocrSource = valueChannel(cv, rgbaOrig);
          }
          // Crop from the native-resolution Value image using source-space
          // bounds directly (no upscale mapping) — see ocrSource note above.
          const read = await readUnitLabel(
            cv,
            ocrSource,
            { bounds: det.bounds, rotationRad: det.rotationRad },
            provider
          );
          if (read) {
            candidate.label = read.label;
            candidate.labelConfidence = read.confidence;
            // A readable unit-number label promotes the rectangle to a unit.
            candidate.kind = 'unit';
          } else {
            unreadable++;
          }
        } catch {
          unreadable++;
        }
      }

      units.push(candidate);
      emit({ type: 'unit', unit: candidate });
      emit({ type: 'progress', done: i + 1, total });
    }

    if (provider) {
      const unitCount = units.filter((u) => u.kind === 'unit').length;
      const rectCount = units.length - unitCount;
      if (rectCount > 0) {
        warnings.push(
          `${rectCount} rectangle(s) had no readable label (flagged "likely not a unit")`
        );
      }
      if (unreadable > 0 && unreadable !== rectCount) {
        warnings.push(`${unreadable} label(s) were unreadable`);
      }
    }

    // Ingest heuristics: drop unlabeled / non-rectangular / tiny outliers.
    const post = filterDetectedUnits(units);
    warnings.push(...post.warnings);
    units.length = 0;
    units.push(...post.kept);

    emit({ type: 'stage', stage: 'finalizing' });

    return {
      imageWidth: decoded.width,
      imageHeight: decoded.height,
      units,
      warnings,
    };
  } finally {
    rgbaOrig.delete();
    work?.delete();
    gray?.delete();
    mask?.delete();
    ocrSource?.delete();
    if (ownProvider) {
      await ownProvider.terminate();
    }
  }
}
