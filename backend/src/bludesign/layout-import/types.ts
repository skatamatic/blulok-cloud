/**
 * BluDesign Layout Import — Detection Engine Types
 *
 * Pixel-space contract for the image/PDF → unit-candidate detection engine.
 * Everything here is expressed in image pixel coordinates with a top-left
 * origin (x→right, y→down). No world/grid/asset conversion happens at this
 * layer — that is the wizard's job in a later phase. Keeping this boundary
 * pure makes the engine deterministic and trivially testable.
 */

/**
 * A rotated rectangle in pixel space, described by its center, size and angle.
 * This mirrors OpenCV's `RotatedRect` (center + size + angle) so detection
 * output maps cleanly from `cv.minAreaRect`.
 */
export interface RotatedRectPx {
  /** Center X in pixels (image top-left origin). */
  cx: number;
  /** Center Y in pixels (image top-left origin). */
  cy: number;
  /** Box width in pixels (the longer/first axis of the rotated rect). */
  width: number;
  /** Box height in pixels. */
  height: number;
}

/**
 * A single detected storage-unit candidate.
 *
 * Confidence fields are normalized 0..1. `detectionConfidence` reflects how
 * "rectangle-like" the contour was (area fill ratio, aspect sanity, etc.);
 * `labelConfidence` is the OCR engine's confidence in the read label.
 */
export interface DetectedUnitCandidate {
  /** Stable id for this candidate within a single detection run. */
  id: string;
  /**
   * Classification of the rectangle:
   *  - 'unit': a rectangle that contains a readable unit-number label → a
   *    storage unit.
   *  - 'rectangle': a valid rectangle with no readable label → "a rectangle but
   *    likely not a storage unit". Kept for review (the human may relabel it).
   */
  kind: 'unit' | 'rectangle';
  /** Center + size of the unit in pixels. */
  bounds: RotatedRectPx;
  /** Rotation in radians from `minAreaRect` (normalized to (-π/2, π/2]). */
  rotationRad: number;
  /** OCR-read label, normalized (e.g. "26", "26A"). Undefined if unreadable. */
  label?: string;
  /** OCR confidence for {@link label}, 0..1. 0 when no label was read. */
  labelConfidence: number;
  /** Detection confidence (shape quality), 0..1. */
  detectionConfidence: number;
  /**
   * Best-effort hint at how many doors the unit has, inferred from aspect
   * ratio relative to the dominant single-door footprint. Optional; the
   * wizard uses this to pick an asset size.
   */
  doorCountHint?: 1 | 2 | 3 | 4;
  /**
   * Dominant fill color of the unit as a hex string (e.g. "#147fd4"), when a
   * color mask was used. Useful for grouping units by color band in review.
   */
  colorHex?: string;
}

/**
 * The full result of running detection on one image. Pixel space only.
 */
export interface LayoutImportDetectionResult {
  /** Source image width in pixels. */
  imageWidth: number;
  /** Source image height in pixels. */
  imageHeight: number;
  /** Detected unit candidates, in no particular order. */
  units: DetectedUnitCandidate[];
  /** Human-readable warnings (e.g. excluded regions, unreadable labels). */
  warnings: string[];
}

/**
 * Coarse-grained pipeline stage, surfaced to the UI for progress reporting.
 *  - 'decoding'      : decoding the uploaded raster.
 *  - 'preprocessing' : upscaling + building the border/line mask.
 *  - 'detecting'     : finding rectangle candidates and resolving nesting.
 *  - 'reading'       : per-rectangle OCR classification (the long pole).
 *  - 'finalizing'    : assembling the result.
 */
export type DetectionStage =
  | 'decoding'
  | 'preprocessing'
  | 'detecting'
  | 'reading'
  | 'finalizing';

/**
 * Progress/discovery events emitted by {@link detectUnits} when an `onEvent`
 * sink is supplied. The streaming route serializes these as NDJSON so the UI can
 * show granular progress and draw boxes as they are discovered. `done`/`error`
 * are emitted by the transport (route), not the engine.
 */
export type DetectionEvent =
  | { type: 'stage'; stage: DetectionStage; message?: string }
  | {
      /** All rectangle candidates found, before OCR (drawn as "pending"). */
      type: 'rectangles';
      total: number;
      units: DetectedUnitCandidate[];
    }
  | { type: 'progress'; done: number; total: number }
  | {
      /** A single candidate whose OCR classification has resolved. */
      type: 'unit';
      unit: DetectedUnitCandidate;
    }
  | { type: 'done'; result: LayoutImportDetectionResult }
  | { type: 'error'; message: string };

/** Sink for {@link DetectionEvent}s. May be sync; the engine never awaits it. */
export type DetectionEventSink = (event: DetectionEvent) => void;

/**
 * A rectangular region of interest in pixel space (axis-aligned), used to
 * exclude things like the legend/summary table from detection.
 */
export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tunable options for the detection pipeline. All optional; the orchestrator
 * applies {@link DEFAULT_DETECTION_OPTIONS} for anything omitted. Keeping the
 * resolved option set explicit is what makes the engine deterministic.
 */
export interface DetectionOptions {
  /**
   * Minimum contour area (in px²) to be considered a unit. Filters out dots,
   * poles, bollards, label glyphs and other noise.
   */
  minAreaPx?: number;
  /**
   * Maximum contour area as a fraction of the total image area. Filters out
   * the outer site boundary / huge background contours.
   */
  maxAreaFraction?: number;
  /**
   * Allowed aspect-ratio range (longSide / shortSide) for a unit rectangle.
   * Storage units are not extremely elongated; this rejects thin lines.
   */
  minAspect?: number;
  maxAspect?: number;
  /**
   * Minimum fill ratio (contourArea / minAreaRect area). Real rectangles fill
   * their bounding box; this rejects L-shapes, arrows and ragged blobs.
   */
  minRectFillRatio?: number;
  /**
   * Minimum mean-fill colorfulness (HSV saturation, 0..1) for a detection to be
   * kept. Storage units are saturated colors; this rejects near-white/grey/black
   * regions such as title text, legend labels and dimension callouts that would
   * otherwise pass the geometric filters. Set to 0 to disable (e.g. for
   * monochrome plans).
   */
  minColorSaturation?: number;
  /**
   * IoU threshold above which two detections are treated as duplicates during
   * non-max suppression.
   */
  nmsIouThreshold?: number;
  /**
   * Axis-aligned regions to exclude from detection (e.g. legend/table). If not
   * provided, the engine auto-detects a top-left legend band heuristically.
   */
  excludeRegions?: PixelRegion[];
  /**
   * When true, auto-exclude a legend/summary band in the top-left corner.
   * Defaults to true.
   */
  autoExcludeLegend?: boolean;
  /** Run OCR per candidate to read labels. Defaults to true. */
  runOcr?: boolean;
  /**
   * Saturation/value thresholds (0..255) for the HSV color mask that isolates
   * the saturated fill colors of units from the white background and black
   * outlines. Only used when {@link segmentation} is 'color'.
   */
  minSaturation?: number;
  minValue?: number;
  /**
   * Segmentation strategy:
   *  - 'border' (default): detect rectangles from their dark outline strokes,
   *    independent of fill color/shade. A morphologically-closed line mask seals
   *    small gaps (tolerating imperfect scans); each enclosed cell becomes a
   *    hole/contour. This is the robust primitive: a rectangle is defined by its
   *    border, not its fill, so light-grey and vivid cells detect identically.
   *  - 'cells': brightness threshold sweep — treats bright fills as foreground
   *    separated by dark grid lines. Fails on light fills that merge with the
   *    page; kept as a fallback for plans with strong fills but faint borders.
   *  - 'color': HSV color mask of saturated fills. Useful when units are not
   *    fully outlined but are distinctly colored.
   */
  segmentation?: 'border' | 'cells' | 'color';
  /**
   * Kernel size (px, on the upscaled working image) for the morphological close
   * that seals gaps in the border/line mask before contouring. Larger values
   * tolerate bigger gaps in outlines but can merge very close cells. Only used
   * by the 'border' strategy.
   */
  borderCloseKernel?: number;
  /**
   * Grayscale thresholds (0..255) separating bright cell fills/background from
   * the dark outline lines, used by the 'cells' strategy. Detection runs once
   * per threshold and the results are unioned + NMS-deduped, because fill colors
   * of differing brightness separate cleanly at different thresholds (a single
   * global threshold cannot isolate cells across red, green, magenta, yellow,
   * cyan and blue simultaneously).
   */
  cellThresholds?: number[];
  /**
   * Detection runs on an internally upscaled copy when the source is small, so
   * thin separators between cells are not lost to sub-pixel borders. The image
   * is scaled so its width is at least this many pixels (integer factor, capped
   * at 4×). Output geometry is mapped back to source pixel space. Set equal to
   * or below the source width to disable upscaling.
   */
  internalUpscaleTargetWidth?: number;
}

/**
 * Fully-resolved detection options (no optionals). Produced by
 * {@link resolveDetectionOptions}.
 */
export type ResolvedDetectionOptions = Required<
  Omit<DetectionOptions, 'excludeRegions'>
> & { excludeRegions: PixelRegion[] };

/**
 * Defaults tuned against the sample overnight-parking site plan. These are the
 * knobs the regression test ratchets over time.
 */
export const DEFAULT_DETECTION_OPTIONS: ResolvedDetectionOptions = {
  // Door cells are smaller than whole units; keep this low so single doors of
  // multi-door units survive (noise is rejected by the colorfulness filter).
  minAreaPx: 40,
  maxAreaFraction: 0.05,
  minAspect: 1.0,
  maxAspect: 6.0,
  minRectFillRatio: 0.6,
  // Border strategy is fill-independent, so the colorfulness gate is OFF by
  // default — light-grey cells are valid units. (The 'color' strategy can
  // re-enable it via options when needed.)
  minColorSaturation: 0,
  nmsIouThreshold: 0.4,
  excludeRegions: [],
  autoExcludeLegend: true,
  runOcr: true,
  minSaturation: 60,
  minValue: 60,
  segmentation: 'border',
  borderCloseKernel: 3,
  // Brightness sweep retained for the 'cells' fallback strategy.
  cellThresholds: [45, 60, 75, 90, 105, 120, 135, 150, 165],
  // ~2× the sample plan keeps the adaptive border mask clean (heavier upscaling
  // injects interpolation noise that fragments bright-filled cells) while staying
  // crisp; OCR crops are upscaled a further 3× independently in cropLabel.
  internalUpscaleTargetWidth: 4000,
};

/**
 * Merge caller-supplied options over the defaults into a fully-resolved set.
 */
export function resolveDetectionOptions(
  options?: DetectionOptions
): ResolvedDetectionOptions {
  return {
    ...DEFAULT_DETECTION_OPTIONS,
    ...(options ?? {}),
    excludeRegions: options?.excludeRegions ?? [],
  };
}
