/**
 * BluDesign Layout Import — Geometry helpers (pixel space)
 *
 * Pure 2D helpers for working with rotated rectangles in the review canvas:
 * corner computation, hit-testing, and converting screen-space drag deltas into
 * a rectangle's local (un-rotated) frame so move/resize/rotate stay intuitive.
 */

import type { DoorSide, RotatedRectPx, UnitDoor } from './types';
import { DEFAULT_DOOR_WIDTH_FRACTION } from './types';

export interface Point {
  x: number;
  y: number;
}

/** The four corners of a rotated rect, clockwise from top-left (local frame). */
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

/** Convert an SVG polygon points string from a rotated rect. */
export function rectPointsAttr(rect: RotatedRectPx, rotationRad: number): string {
  return rectCorners(rect, rotationRad)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
}

/** Rotate a world-space vector into the rect's local frame. */
export function toLocal(dx: number, dy: number, rotationRad: number): Point {
  const cos = Math.cos(-rotationRad);
  const sin = Math.sin(-rotationRad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Rotate a local-frame vector back into world space. */
export function toWorld(lx: number, ly: number, rotationRad: number): Point {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

/** Is a world-space point inside the rotated rect? */
export function pointInRect(
  point: Point,
  rect: RotatedRectPx,
  rotationRad: number
): boolean {
  const local = toLocal(point.x - rect.cx, point.y - rect.cy, rotationRad);
  return Math.abs(local.x) <= rect.width / 2 && Math.abs(local.y) <= rect.height / 2;
}

/** Axis-aligned bounding box of a rotated rect (for list thumbnails, fitting). */
export function aabb(rect: RotatedRectPx, rotationRad: number) {
  const corners = rectCorners(rect, rotationRad);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface AxisRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True when two axis-aligned rects overlap (non-zero area). */
export function axisRectsOverlap(a: AxisRect, b: AxisRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** True when a unit's axis-aligned bounds intersect a marquee (image space). */
export function unitIntersectsMarquee(
  bounds: RotatedRectPx,
  rotationRad: number,
  marquee: AxisRect
): boolean {
  return axisRectsOverlap(aabb(bounds, rotationRad), marquee);
}

/** Corner handle identifiers (local frame). */
export type CornerId = 'tl' | 'tr' | 'br' | 'bl';

export const CORNER_ORDER: CornerId[] = ['tl', 'tr', 'br', 'bl'];

/** Local-frame sign of each corner: (±hw, ±hh). */
export function cornerSign(corner: CornerId): Point {
  switch (corner) {
    case 'tl':
      return { x: -1, y: -1 };
    case 'tr':
      return { x: 1, y: -1 };
    case 'br':
      return { x: 1, y: 1 };
    case 'bl':
      return { x: -1, y: 1 };
  }
}

/**
 * Resize a rotated rect by dragging one corner to a new world position while
 * keeping the opposite corner pinned. Returns the new center + size.
 */
export function resizeRectByCorner(
  rect: RotatedRectPx,
  rotationRad: number,
  corner: CornerId,
  worldPoint: Point,
  minSize = 4
): RotatedRectPx {
  const corners = rectCorners(rect, rotationRad);
  const idx = CORNER_ORDER.indexOf(corner);
  const oppositeIdx = (idx + 2) % 4;
  const anchor = corners[oppositeIdx];

  // Vector from the pinned anchor to the dragged point, in local frame.
  const local = toLocal(worldPoint.x - anchor.x, worldPoint.y - anchor.y, rotationRad);
  const sign = cornerSign(corner);
  const width = Math.max(minSize, Math.abs(local.x));
  const height = Math.max(minSize, Math.abs(local.y));

  // New center is anchor + half the (signed) local diagonal, rotated to world.
  const halfLocal = { x: (sign.x * width) / 2, y: (sign.y * height) / 2 };
  const worldHalf = toWorld(halfLocal.x, halfLocal.y, rotationRad);
  return {
    cx: anchor.x + worldHalf.x,
    cy: anchor.y + worldHalf.y,
    width,
    height,
  };
}

/** Normalize an angle to (-π/2, π/2], matching the detection engine. */
export function normalizeRotation(rad: number): number {
  let r = rad;
  while (r > Math.PI / 2) r -= Math.PI;
  while (r <= -Math.PI / 2) r += Math.PI;
  return r;
}

export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

// --- Doors ---------------------------------------------------------------

export const DOOR_SIDES: DoorSide[] = ['top', 'bottom', 'left', 'right'];

/** Local-frame outward unit normal for each door side. */
const LOCAL_DOOR_NORMAL: Record<DoorSide, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** A sensible default door (centered, 80% of the edge) on a given side. */
export function defaultDoor(side: DoorSide, auto = true): UnitDoor {
  return { side, widthFraction: DEFAULT_DOOR_WIDTH_FRACTION, offsetFraction: 0, auto };
}

/** True when the door runs along the rect's local Y axis (left/right edges). */
export function isVerticalDoorSide(side: DoorSide): boolean {
  return side === 'left' || side === 'right';
}

/** Length (px) of the edge a door sits on. */
export function doorEdgeLength(rect: RotatedRectPx, side: DoorSide): number {
  return isVerticalDoorSide(side) ? rect.height : rect.width;
}

/** Outward unit normal (world space) the door faces, accounting for rotation. */
export function doorNormalWorld(side: DoorSide, rotationRad: number): Point {
  const n = LOCAL_DOOR_NORMAL[side];
  return toWorld(n.x, n.y, rotationRad);
}

/**
 * Clamp an offset fraction so the opening stays fully on its edge given a width
 * fraction. Centered (0) is always valid; the bound shrinks as the door widens.
 */
export function clampDoorOffset(offsetFraction: number, widthFraction: number): number {
  const limit = Math.max(0, (1 - clamp01(widthFraction)) / 2);
  return Math.max(-limit, Math.min(limit, offsetFraction));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface DoorSegment {
  /** Opening endpoints in world space. */
  a: Point;
  b: Point;
  /** Midpoint of the opening (world space). */
  mid: Point;
  /** Outward facing direction (world, unit length). */
  normal: Point;
  /** Opening length in px (world space). */
  length: number;
}

/**
 * Resolve a door's opening into world-space endpoints + facing direction.
 * Width and offset are clamped so the opening always lies on its edge.
 */
export function doorSegment(
  rect: RotatedRectPx,
  rotationRad: number,
  door: UnitDoor
): DoorSegment {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const edgeLen = doorEdgeLength(rect, door.side);
  const width = clamp01(door.widthFraction);
  const offset = clampDoorOffset(door.offsetFraction, width);
  const doorLen = width * edgeLen;
  const halfDoor = doorLen / 2;
  const center = offset * edgeLen;

  let localA: Point;
  let localB: Point;
  if (isVerticalDoorSide(door.side)) {
    const x = door.side === 'left' ? -hw : hw;
    localA = { x, y: center - halfDoor };
    localB = { x, y: center + halfDoor };
  } else {
    const y = door.side === 'top' ? -hh : hh;
    localA = { x: center - halfDoor, y };
    localB = { x: center + halfDoor, y };
  }

  const a = worldOf(rect, localA, rotationRad);
  const b = worldOf(rect, localB, rotationRad);
  return {
    a,
    b,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    normal: doorNormalWorld(door.side, rotationRad),
    length: doorLen,
  };
}

function worldOf(rect: RotatedRectPx, local: Point, rotationRad: number): Point {
  const w = toWorld(local.x, local.y, rotationRad);
  return { x: rect.cx + w.x, y: rect.cy + w.y };
}
