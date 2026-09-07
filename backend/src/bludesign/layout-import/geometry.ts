/**
 * Pure 2D geometry helpers for rotated rectangles.
 *
 * Shared by detection NMS and the metrics harness so IoU is computed exactly
 * one way everywhere. No OpenCV dependency — these are plain math so they run in
 * the fast default Jest suite.
 */

import type { RotatedRectPx } from './types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Four corner points of a rotated rectangle, in order. `rotationRad` rotates
 * the box about its center (positive = clockwise in image coords where y grows
 * downward).
 */
export function rectCorners(rect: RotatedRectPx, rotationRad: number): Point[] {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const local: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => ({
    x: rect.cx + p.x * cos - p.y * sin,
    y: rect.cy + p.x * sin + p.y * cos,
  }));
}

/** Shoelace area of a simple polygon (absolute value). */
export function polygonArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Clip subject polygon by a convex clip polygon (Sutherland–Hodgman). Both must
 * be given in consistent (here: clockwise) winding. Returns the clipped polygon
 * (possibly empty).
 */
export function clipPolygon(subject: Point[], clip: Point[]): Point[] {
  let output = subject.slice();

  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    if (input.length === 0) break;

    // Edge from a→b. `rectCorners` emits corners with a consistent winding
    // whose interior lies on the side where this cross product is >= 0.
    const inside = (p: Point) =>
      (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;

    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);

      if (curIn) {
        if (!prevIn) {
          const ip = lineIntersect(prev, cur, a, b);
          if (ip) output.push(ip);
        }
        output.push(cur);
      } else if (prevIn) {
        const ip = lineIntersect(prev, cur, a, b);
        if (ip) output.push(ip);
      }
    }
  }
  return output;
}

/** Intersection point of segment p1p2 with the infinite line through p3p4. */
function lineIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const d = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(d) < 1e-9) return null;
  const t =
    ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

/** Intersection area of two rotated rectangles via polygon clipping. */
export function rotatedRectIntersectionArea(
  a: RotatedRectPx,
  aRot: number,
  b: RotatedRectPx,
  bRot: number
): number {
  const polyA = rectCorners(a, aRot);
  const polyB = rectCorners(b, bRot);
  const clipped = clipPolygon(polyA, polyB);
  if (clipped.length < 3) return 0;
  return polygonArea(clipped);
}

/**
 * Intersection-over-union of two rotated rectangles. Returns 0..1.
 */
export function rotatedRectIoU(
  a: RotatedRectPx,
  aRot: number,
  b: RotatedRectPx,
  bRot: number
): number {
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  if (areaA <= 0 || areaB <= 0) return 0;
  const inter = rotatedRectIntersectionArea(a, aRot, b, bRot);
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}
