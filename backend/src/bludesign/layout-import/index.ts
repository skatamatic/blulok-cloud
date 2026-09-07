/**
 * BluDesign Layout Import — public barrel.
 *
 * The detection engine's stable surface. Downstream code (route, CLI, tests,
 * future wizard) should import from here rather than reaching into submodules.
 */

export * from './types';
export * from './geometry';
export { decodeImage } from './image/decodeImage';
export type { DecodedImage } from './image/decodeImage';
export { detectUnits, doorCountHintFromAspect } from './detectUnits';
export type { DetectUnitsDeps } from './detectUnits';
export {
  TesseractOcrProvider,
  FallbackOcrProvider,
  RobustOcrProvider,
  createDefaultOcrProvider,
  normalizeLabel,
  VENDORED_TESSDATA_DIR,
} from './ocr/ocrLabels';
export type {
  OcrProvider,
  OcrResult,
  OcrImageInput,
  OcrPsmMode,
} from './ocr/ocrLabels';
export {
  computeDetectionMetrics,
  type GroundTruthUnit,
  type DetectionMetrics,
} from './metrics';
