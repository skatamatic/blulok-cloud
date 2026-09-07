/**
 * Tests for the layout-import rotated-rect geometry helpers.
 */

import {
  rectCorners,
  pointInRect,
  toLocal,
  toWorld,
  resizeRectByCorner,
  normalizeRotation,
  cornerSign,
  aabb,
  radToDeg,
  degToRad,
} from '@/components/bludesign/layout-import/geometry';
import type { RotatedRectPx } from '@/components/bludesign/layout-import/types';

const rect: RotatedRectPx = { cx: 50, cy: 50, width: 20, height: 10 };

describe('rectCorners', () => {
  it('returns axis-aligned corners (clockwise from top-left) at rotation 0', () => {
    const [tl, tr, br, bl] = rectCorners(rect, 0);
    expect(tl).toEqual({ x: 40, y: 45 });
    expect(tr).toEqual({ x: 60, y: 45 });
    expect(br).toEqual({ x: 60, y: 55 });
    expect(bl).toEqual({ x: 40, y: 55 });
  });

  it('rotates corners about the center', () => {
    const corners = rectCorners(rect, Math.PI / 2);
    // After a 90° rotation every corner stays equidistant from the center.
    for (const c of corners) {
      const d = Math.hypot(c.x - 50, c.y - 50);
      expect(d).toBeCloseTo(Math.hypot(10, 5), 6);
    }
  });
});

describe('toLocal / toWorld', () => {
  it('are inverses of each other', () => {
    const angle = 0.7;
    const v = { x: 12.5, y: -4.2 };
    const local = toLocal(v.x, v.y, angle);
    const world = toWorld(local.x, local.y, angle);
    expect(world.x).toBeCloseTo(v.x, 6);
    expect(world.y).toBeCloseTo(v.y, 6);
  });
});

describe('pointInRect', () => {
  it('detects points inside and outside an axis-aligned rect', () => {
    expect(pointInRect({ x: 50, y: 50 }, rect, 0)).toBe(true);
    expect(pointInRect({ x: 59, y: 54 }, rect, 0)).toBe(true);
    expect(pointInRect({ x: 61, y: 50 }, rect, 0)).toBe(false);
    expect(pointInRect({ x: 50, y: 56 }, rect, 0)).toBe(false);
  });

  it('respects rotation', () => {
    // A point just past the un-rotated right edge falls inside once rotated 90°.
    const tall: RotatedRectPx = { cx: 0, cy: 0, width: 4, height: 40 };
    expect(pointInRect({ x: 15, y: 0 }, tall, 0)).toBe(false);
    expect(pointInRect({ x: 15, y: 0 }, tall, Math.PI / 2)).toBe(true);
  });
});

describe('cornerSign', () => {
  it('maps corners to local-frame signs', () => {
    expect(cornerSign('tl')).toEqual({ x: -1, y: -1 });
    expect(cornerSign('tr')).toEqual({ x: 1, y: -1 });
    expect(cornerSign('br')).toEqual({ x: 1, y: 1 });
    expect(cornerSign('bl')).toEqual({ x: -1, y: 1 });
  });
});

describe('resizeRectByCorner', () => {
  it('pins the opposite corner when dragging (rotation 0)', () => {
    const next = resizeRectByCorner(rect, 0, 'br', { x: 70, y: 65 });
    expect(next).toEqual({ cx: 55, cy: 55, width: 30, height: 20 });
    // The pinned top-left corner must not move.
    const [tl] = rectCorners(next, 0);
    expect(tl.x).toBeCloseTo(40, 6);
    expect(tl.y).toBeCloseTo(45, 6);
  });

  it('enforces a minimum size', () => {
    const next = resizeRectByCorner(rect, 0, 'br', { x: 40, y: 45 }, 4);
    expect(next.width).toBe(4);
    expect(next.height).toBe(4);
  });

  it('keeps the anchor pinned even when rotated', () => {
    const angle = 0.6;
    const corners = rectCorners(rect, angle);
    const anchorTl = corners[0];
    const next = resizeRectByCorner(rect, angle, 'br', { x: 80, y: 80 });
    const newTl = rectCorners(next, angle)[0];
    expect(newTl.x).toBeCloseTo(anchorTl.x, 6);
    expect(newTl.y).toBeCloseTo(anchorTl.y, 6);
  });
});

describe('normalizeRotation', () => {
  it('wraps into (-π/2, π/2]', () => {
    expect(normalizeRotation(Math.PI)).toBeCloseTo(0, 6);
    expect(normalizeRotation((3 * Math.PI) / 4)).toBeCloseTo(-Math.PI / 4, 6);
    expect(normalizeRotation(-Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(normalizeRotation(0.3)).toBeCloseTo(0.3, 6);
  });
});

describe('aabb', () => {
  it('computes the bounding box of an axis-aligned rect', () => {
    expect(aabb(rect, 0)).toEqual({ x: 40, y: 45, width: 20, height: 10 });
  });
});

describe('radToDeg / degToRad', () => {
  it('convert and round-trip', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 6);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 6);
    expect(radToDeg(degToRad(37))).toBeCloseTo(37, 6);
  });
});
