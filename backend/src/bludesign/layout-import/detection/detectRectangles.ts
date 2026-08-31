/**
 * Rectangle detection from a binary mask.
 *
 * Given a binary foreground mask (typically the HSV color mask of unit fills),
 * find external contours, fit a `minAreaRect` to each, and emit a raw rotated
 * rectangle with shape-quality metadata. Filtering/NMS happens downstream in
 * `filters.ts`; this module only turns pixels into geometric candidates.
 */

import type { CvModule } from '../opencv';
import type { RotatedRectPx } from '../types';

export interface RawDetection {
  bounds: RotatedRectPx;
  /** Rotation in radians, normalized to (-π/2, π/2]. */
  rotationRad: number;
  /** contourArea / minAreaRect-area, 0..1. Higher = more rectangle-like. */
  fillRatio: number;
  /** Raw contour area in px². */
  areaPx: number;
  /** Mean fill color over the contour as a hex string, when computed. */
  colorHex?: string;
}

/**
 * Normalize an OpenCV `minAreaRect` (center/size/angle-in-degrees) into our
 * pixel-space rotated rect with angle in radians on (-π/2, π/2]. OpenCV's angle
 * convention varies by version and is tied to which side it calls "width", so
 * we re-orient to a canonical longer-axis-as-width form for stable rotations.
 */
export function normalizeMinAreaRect(rect: {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
}): { bounds: RotatedRectPx; rotationRad: number } {
  let { width, height } = rect.size;
  let angleDeg = rect.angle;

  // Canonicalize so width is the longer axis; rotate angle by 90° when swapping
  // so the geometry is unchanged.
  if (width < height) {
    const t = width;
    width = height;
    height = t;
    angleDeg += 90;
  }

  // Wrap to (-90, 90].
  let a = angleDeg;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;

  return {
    bounds: { cx: rect.center.x, cy: rect.center.y, width, height },
    rotationRad: (a * Math.PI) / 180,
  };
}

function meanColorHex(cv: CvModule, rgba: any, contours: any, index: number): string | undefined {
  const mask = cv.Mat.zeros(rgba.rows, rgba.cols, cv.CV_8UC1);
  try {
    const color = new cv.Scalar(255);
    cv.drawContours(mask, contours, index, color, -1);
    const mean = cv.mean(rgba, mask); // [r, g, b, a]
    const r = Math.round(mean[0]);
    const g = Math.round(mean[1]);
    const b = Math.round(mean[2]);
    return (
      '#' +
      [r, g, b]
        .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return undefined;
  } finally {
    mask.delete();
  }
}

/** Contour retrieval mode. `list` returns every contour (incl. nested cells);
 * `external` only the outermost. Cells enclosed by a grid of lines are nested,
 * so `list` is required to recover them. */
export type RetrievalMode = 'external' | 'list';

/**
 * Detect raw rotated-rectangle candidates from a binary mask.
 *
 * @param cv      initialized OpenCV module
 * @param mask    single-channel binary (0/255) foreground mask
 * @param rgba    optional source RGBA Mat for per-contour mean color
 * @param mode    contour retrieval mode (default 'list')
 */
export function detectRectangles(
  cv: CvModule,
  mask: any,
  rgba?: any,
  mode: RetrievalMode = 'list'
): RawDetection[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    mask,
    contours,
    hierarchy,
    mode === 'external' ? cv.RETR_EXTERNAL : cv.RETR_LIST,
    cv.CHAIN_APPROX_SIMPLE
  );

  const results: RawDetection[] = [];
  try {
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const areaPx = cv.contourArea(contour);
      if (areaPx <= 0) {
        contour.delete();
        continue;
      }
      const mar = cv.minAreaRect(contour);
      const { bounds, rotationRad } = normalizeMinAreaRect({
        center: { x: mar.center.x, y: mar.center.y },
        size: { width: mar.size.width, height: mar.size.height },
        angle: mar.angle,
      });
      const rectArea = bounds.width * bounds.height;
      const fillRatio = rectArea > 0 ? Math.min(1, areaPx / rectArea) : 0;
      const colorHex = rgba ? meanColorHex(cv, rgba, contours, i) : undefined;

      results.push({ bounds, rotationRad, fillRatio, areaPx, colorHex });
      contour.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }

  return results;
}
