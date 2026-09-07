/**
 * BluDesign Layout Import — Frontend Types
 *
 * Pixel-space contract mirroring the backend detection engine
 * (`backend/src/bludesign/layout-import/types.ts`). Everything is expressed in
 * source-image pixel coordinates with a top-left origin (x→right, y→down).
 */

/** A rotated rectangle in pixel space (center + size). Mirrors OpenCV RotatedRect. */
export interface RotatedRectPx {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** A single detected storage-unit candidate returned by the backend. */
export interface DetectedUnitCandidate {
  id: string;
  /**
   * 'unit'      — a rectangle with a readable unit-number label (a storage unit).
   * 'rectangle' — a valid rectangle with no readable label ("likely not a unit").
   */
  kind: 'unit' | 'rectangle';
  bounds: RotatedRectPx;
  /** Rotation in radians, normalized to (-π/2, π/2]. */
  rotationRad: number;
  label?: string;
  labelConfidence: number;
  detectionConfidence: number;
  colorHex?: string;
}

/**
 * Which edge of a unit the door sits on, expressed in the rect's *local*
 * (un-rotated) frame: 'top' = the −height edge, 'bottom' = the +height edge,
 * 'left' = the −width edge, 'right' = the +width edge. The door faces outward
 * along that edge's normal.
 */
export type DoorSide = 'top' | 'bottom' | 'left' | 'right';

/** Default fraction of the door-side edge length that the opening spans. */
export const DEFAULT_DOOR_WIDTH_FRACTION = 0.8;

/** A door opening placed on one edge of a unit. */
export interface UnitDoor {
  side: DoorSide;
  /** Opening width as a fraction (0..1) of the door-side edge length. */
  widthFraction: number;
  /**
   * Center offset along the edge as a fraction (−0.5..0.5) of the edge length.
   * 0 = centered. Positive shifts toward +x (top/bottom) or +y (left/right).
   */
  offsetFraction: number;
  /**
   * True while the door is auto-assigned by the ingest heuristic. Cleared once
   * the user overrides it, so re-running auto-placement won't clobber edits.
   */
  auto: boolean;
}

/** Full detection result for one image. Pixel space only. */
export interface LayoutImportDetectionResult {
  imageWidth: number;
  imageHeight: number;
  units: DetectedUnitCandidate[];
  warnings: string[];
}

/** Axis-aligned region of interest, used to exclude areas from detection. */
export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tunable detection options forwarded to the backend (all optional). */
export interface DetectionOptions {
  minAreaPx?: number;
  maxAreaFraction?: number;
  minAspect?: number;
  maxAspect?: number;
  minRectFillRatio?: number;
  minColorSaturation?: number;
  nmsIouThreshold?: number;
  excludeRegions?: PixelRegion[];
  autoExcludeLegend?: boolean;
  runOcr?: boolean;
  minSaturation?: number;
  minValue?: number;
  segmentation?: 'border' | 'cells' | 'color';
  borderCloseKernel?: number;
  cellThresholds?: number[];
  internalUpscaleTargetWidth?: number;
}

/**
 * Coarse pipeline stage surfaced for progress UI. Mirrors the backend
 * `DetectionStage`.
 */
export type DetectionStage =
  | 'decoding'
  | 'preprocessing'
  | 'detecting'
  | 'reading'
  | 'finalizing';

/**
 * Streamed progress/discovery events from the backend NDJSON detect endpoint.
 * Mirrors the backend `DetectionEvent`.
 */
export type DetectionStreamEvent =
  | { type: 'stage'; stage: DetectionStage; message?: string }
  | { type: 'rectangles'; total: number; units: DetectedUnitCandidate[] }
  | { type: 'progress'; done: number; total: number }
  | { type: 'unit'; unit: DetectedUnitCandidate }
  | { type: 'done'; result: LayoutImportDetectionResult }
  | { type: 'error'; message: string };

/** Human-readable label for each backend detection stage. */
export const DETECTION_STAGE_LABELS: Record<DetectionStage, string> = {
  decoding: 'Decoding image',
  preprocessing: 'Preparing image',
  detecting: 'Finding rectangles',
  reading: 'Reading unit labels',
  finalizing: 'Finalizing',
};

/** User-facing import pipeline step (backend + frontend post-process). */
export type ImportPipelineStage =
  | 'finding'
  | 'reading'
  | 'filtering'
  | 'labeling'
  | 'aligning'
  | 'doors';

export const IMPORT_PIPELINE_STEPS: {
  id: ImportPipelineStage;
  label: string;
  detail: string;
}[] = [
  {
    id: 'finding',
    label: 'Finding units in plan',
    detail: 'Scanning the image for storage unit shapes',
  },
  {
    id: 'reading',
    label: 'Reading unit numbers',
    detail: 'Running OCR on each detected cell',
  },
  {
    id: 'filtering',
    label: 'Removing false detections',
    detail: 'Dropping noise, duplicates, and non-units',
  },
  {
    id: 'labeling',
    label: 'Correcting labels',
    detail: 'Filling gaps and fixing misreads from neighbors',
  },
  {
    id: 'aligning',
    label: 'Aligning rows & columns',
    detail: 'Snapping walls to a consistent grid',
  },
  {
    id: 'doors',
    label: 'Placing doors',
    detail: 'Estimating likely door positions',
  },
];

/** Map a backend stream stage to the user-facing pipeline step. */
export function mapBackendStageToPipeline(stage: DetectionStage): ImportPipelineStage {
  switch (stage) {
    case 'decoding':
    case 'preprocessing':
    case 'detecting':
      return 'finding';
    case 'reading':
      return 'reading';
    case 'finalizing':
      return 'filtering';
  }
}

/** Live progress snapshot held by the editor while import runs. */
export interface DetectionProgress {
  stage: ImportPipelineStage;
  /** Step denominator when the active step reports determinate progress. */
  total: number;
  /** Step numerator when the active step reports determinate progress. */
  done: number;
  /** Optional sub-status (e.g. while reading the uploaded file). */
  detail?: string;
}

/**
 * A detected unit as held in the editor. Extends the backend candidate with
 * local review state so a human-in-the-loop can adjust the first pass.
 */
export interface EditableUnit extends DetectedUnitCandidate {
  /** True when the user has moved/resized/rotated/relabeled this unit. */
  edited?: boolean;
  /** True when this unit was added by the user (not detected). */
  manual?: boolean;
  /** Door placement (auto-assigned during ingest, overrideable by the user). */
  door?: UnitDoor;
}

/** Editor interaction tools. */
export type EditorTool = 'select' | 'add';

/** Pan/zoom transform applied to the canvas content. */
export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}
