/**
 * Image preprocessing for detection.
 *
 * Produces the intermediate Mats the detector consumes:
 *  - an RGBA source Mat (from decoded pixels),
 *  - an HSV color mask isolating saturated unit fills from the white page and
 *    black outlines (the primary signal for this style of colored site plan),
 *  - a grayscale + adaptive-threshold binary (generic fallback / line work),
 *  - an optional deskew angle estimated from dominant near-horizontal lines.
 *
 * Callers own every returned Mat and MUST `.delete()` them. Helpers here never
 * retain references, so memory accounting stays local to the orchestrator.
 */

import type { CvModule } from '../opencv';
import type { DecodedImage } from './decodeImage';

/**
 * Build an RGBA OpenCV Mat from decoded pixels. Caller owns the Mat.
 */
export function toRgbaMat(cv: CvModule, image: DecodedImage): any {
  // `matFromImageData` expects an object with { data, width, height } where
  // data is a Uint8ClampedArray of RGBA. DecodedImage matches that shape.
  return cv.matFromImageData({
    data: image.data,
    width: image.width,
    height: image.height,
  });
}

/**
 * Convert an RGBA Mat to single-channel grayscale. Caller owns the result.
 */
export function toGray(cv: CvModule, rgba: any): any {
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  return gray;
}

/**
 * OCR source for colored site plans: a contrast-flattened image where every
 * unit fill becomes white and the black unit number stays black, whatever the
 * fill color. Single-channel Mat; caller owns it.
 *
 * Two steps:
 *  1. HSV "Value" channel = max(R, G, B). Plain luma grayscale (`toGray`) darkens
 *     saturated fills — blue → ~29, red → ~76 — so a *black* number on that fill
 *     has almost no contrast and Tesseract reads nothing. Value maps vivid fills
 *     (red/blue/cyan/magenta/yellow) to ~255 while digits stay ~0.
 *  2. Background division. Value alone leaves *green* fills mid-gray (max channel
 *     ~177), so the page looks white but green cells look grey. We estimate the
 *     local fill brightness by morphologically closing the dark text away, then
 *     divide value / background → every fill normalizes to ~white while digits
 *     stay dark. This is illumination flattening, NOT binarization: strokes keep
 *     their anti-aliasing, which Tesseract reads better than a hard 1-bit image.
 */
export function valueChannel(cv: CvModule, rgba: any): any {
  const channels = new cv.MatVector();
  const value = new cv.Mat();
  cv.split(rgba, channels);
  try {
    cv.max(channels.get(0), channels.get(1), value);
    cv.max(value, channels.get(2), value);
  } finally {
    channels.delete();
  }

  const background = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
  const valueF = new cv.Mat();
  const backgroundF = new cv.Mat();
  const dividedF = new cv.Mat();
  const out = new cv.Mat();
  try {
    cv.morphologyEx(value, background, cv.MORPH_CLOSE, kernel);
    value.convertTo(valueF, cv.CV_32F);
    background.convertTo(backgroundF, cv.CV_32F);
    cv.divide(valueF, backgroundF, dividedF, 255);
    dividedF.convertTo(out, cv.CV_8U);
  } finally {
    value.delete();
    background.delete();
    kernel.delete();
    valueF.delete();
    backgroundF.delete();
    dividedF.delete();
  }
  return out;
}

/**
 * HSV color mask isolating saturated fills (units) from white background and
 * black/grey line work. Returns a binary (0/255) single-channel Mat.
 */
export function colorMask(
  cv: CvModule,
  rgba: any,
  minSaturation: number,
  minValue: number
): any {
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
    0,
    minSaturation,
    minValue,
    0,
  ]);
  const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
    180,
    255,
    255,
    255,
  ]);
  const mask = new cv.Mat();
  cv.inRange(hsv, low, high, mask);

  rgb.delete();
  hsv.delete();
  low.delete();
  high.delete();
  return mask;
}

/**
 * "Cells" mask: bright pixels (cell fills + page background) as foreground,
 * dark outline lines as background. Combined with `RETR_LIST` contour
 * retrieval, each cell enclosed by the black grid becomes its own contour —
 * the robust signal for outlined site plans. Returns a binary (0/255) Mat.
 */
export function cellMask(cv: CvModule, gray: any, threshold: number): any {
  const mask = new cv.Mat();
  cv.threshold(gray, mask, threshold, 255, cv.THRESH_BINARY);
  return mask;
}

/**
 * Integer-upscale an RGBA Mat so its width is at least `targetWidth` (factor
 * capped at 4×). Returns `{ mat, scale }`; when no upscaling is needed `scale`
 * is 1 and `mat` is a clone of the input (caller always owns the returned Mat).
 */
export function upscaleToWidth(
  cv: CvModule,
  rgba: any,
  targetWidth: number
): { mat: any; scale: number } {
  const width = rgba.cols;
  let scale = 1;
  if (width > 0 && targetWidth > width) {
    scale = Math.min(4, Math.max(1, Math.ceil(targetWidth / width)));
  }
  if (scale === 1) {
    return { mat: rgba.clone(), scale: 1 };
  }
  const out = new cv.Mat();
  cv.resize(
    rgba,
    out,
    new cv.Size(rgba.cols * scale, rgba.rows * scale),
    0,
    0,
    cv.INTER_NEAREST
  );
  return { mat: out, scale };
}

/**
 * Adaptive-threshold binary from grayscale. Inverts so foreground (dark lines /
 * filled shapes) is white, which is what `findContours` expects.
 */
export function adaptiveBinary(cv: CvModule, gray: any): any {
  const binary = new cv.Mat();
  cv.adaptiveThreshold(
    gray,
    binary,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    15,
    5
  );
  return binary;
}

/**
 * Morphological close to seal small gaps in a binary mask so unit outlines form
 * solid closed contours. Returns a new Mat; caller owns it.
 */
export function closeMask(cv: CvModule, mask: any, kernelSize = 3): any {
  const out = new cv.Mat();
  const kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(kernelSize, kernelSize)
  );
  cv.morphologyEx(mask, out, cv.MORPH_CLOSE, kernel);
  kernel.delete();
  return out;
}

/**
 * "Border" mask: isolate the dark outline strokes that define rectangles,
 * independent of fill color/shade, then morphologically close to seal small
 * gaps so each cell forms a fully-enclosed ring.
 *
 * Pipeline: adaptive inverse threshold (local, so faint borders survive uneven
 * exposure) → close with a small kernel. The result has the grid lines as
 * connected foreground; every enclosed cell is a hole. Feeding this to
 * `findContours(RETR_LIST)` recovers each cell as its own contour regardless of
 * whether the fill is white, light-grey or vivid — which a brightness threshold
 * cannot do. Returns a binary (0/255) Mat; caller owns it.
 */
export function borderMask(cv: CvModule, gray: any, closeKernel = 3): any {
  const adaptive = adaptiveBinary(cv, gray);
  if (closeKernel <= 1) {
    return adaptive;
  }
  const closed = closeMask(cv, adaptive, closeKernel);
  adaptive.delete();
  return closed;
}

/**
 * Estimate the dominant skew angle (radians) from near-horizontal lines using a
 * probabilistic Hough transform on the binary edges. Returns 0 if no confident
 * dominant angle is found. Positive = image rotated counter-clockwise.
 *
 * This is intentionally conservative: we only consider lines within ±20° of
 * horizontal and take the median angle, so a few diagonal site-boundary lines
 * do not bias the estimate.
 */
export function estimateSkewRad(cv: CvModule, binary: any): number {
  const lines = new cv.Mat();
  // edges already implied by binary; HoughLinesP on it directly.
  cv.HoughLinesP(binary, lines, 1, Math.PI / 180, 100, 50, 10);

  const angles: number[] = [];
  const maxDev = (20 * Math.PI) / 180;
  for (let i = 0; i < lines.rows; i++) {
    const x1 = lines.data32S[i * 4];
    const y1 = lines.data32S[i * 4 + 1];
    const x2 = lines.data32S[i * 4 + 2];
    const y2 = lines.data32S[i * 4 + 3];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    // normalize toward horizontal
    let a = angle;
    if (a > Math.PI / 2) a -= Math.PI;
    if (a < -Math.PI / 2) a += Math.PI;
    if (Math.abs(a) <= maxDev) {
      angles.push(a);
    }
  }
  lines.delete();

  if (angles.length === 0) {
    return 0;
  }
  angles.sort((p, q) => p - q);
  const mid = Math.floor(angles.length / 2);
  return angles.length % 2 === 0
    ? (angles[mid - 1] + angles[mid]) / 2
    : angles[mid];
}
