/**
 * Snap-align detected units onto clean shared lines.
 *
 * Detection output is a noisy raster interpretation of a vector-like drawing:
 * units that are physically colinear / abutting come back with a few pixels of
 * jitter in position, size, and rotation. Storage-facility plans have a strong
 * prior we exploit directly:
 *
 *   - the site uses a handful of dominant orientations, and
 *   - walls are shared: a row's frontage edges are colinear, a unit's right
 *     wall IS its neighbor's left wall.
 *
 * So instead of discovering rows/chains and fitting lines through centers, we:
 *
 *  1. Cluster unit rotations (mod 90°, area-weighted) and snap each unit's
 *     rotation to its cluster's weighted median.
 *  2. Per rotation cluster, rotate centers into the cluster frame — every
 *     member is now axis-aligned — and 1-D cluster all edge coordinates
 *     (left/right walls on x, top/bottom walls on y). Each edge snaps to its
 *     cluster's weighted mean line.
 *
 * Colinear edges collapse onto one line, abutting walls become exactly shared,
 * and every correction is bounded by the cluster tolerance, so the algorithm
 * cannot re-pose the layout. Units with no agreeing partner simply don't move.
 */

import { normalizeRotation } from './geometry';
import type { EditableUnit } from './types';

export interface SnapAlignOptions {
  /** Max rotation correction per unit, in degrees. */
  maxRotDeg?: number;
  /** Edge-cluster tolerance as a fraction of the cluster's median short side. */
  edgeToleranceFraction?: number;
  /** When set, only these unit ids are adjusted (selection mode). */
  onlyIds?: ReadonlySet<string>;
}

const DEFAULTS: Required<Omit<SnapAlignOptions, 'onlyIds'>> = {
  maxRotDeg: 5,
  edgeToleranceFraction: 0.24,
};

/**
 * Adjacent angles farther apart than this start a new rotation cluster.
 * Detector jitter within one physical orientation stays under ~2.5°; truly
 * distinct row orientations on a plan differ by more.
 */
const ANGLE_GAP_TOL = (2.5 * Math.PI) / 180;
/** A snapped edge pair may change a unit's size by at most this fraction. */
const MAX_SIZE_CHANGE_FRACTION = 0.2;

const QUARTER = Math.PI / 2;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function shortestAngleDelta(from: number, to: number): number {
  let d = normalizeRotation(to) - normalizeRotation(from);
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
}

/**
 * Smallest rotation that aligns `from` with the axis family of `to`
 * (i.e. to, to±90°, to±180°). Result is in [-45°, 45°).
 */
export function shortestAxisDelta(from: number, to: number): number {
  let d = (to - from) % QUARTER;
  if (d >= QUARTER / 2) d -= QUARTER;
  if (d < -QUARTER / 2) d += QUARTER;
  return d;
}

/** Median rotation with unwrap — avoids 90°/−87° collapsing to 0°. */
export function medianRotation(rads: number[]): number {
  if (rads.length === 0) return 0;
  if (rads.length === 1) return normalizeRotation(rads[0]);
  const base = rads[0];
  const unwrapped = rads.map((r) => base + shortestAngleDelta(base, r));
  unwrapped.sort((a, b) => a - b);
  return normalizeRotation(unwrapped[Math.floor(unwrapped.length / 2)]);
}

type OrientationBucket = 'vertical' | 'horizontal';

/** Vertical lockers (~±90°) vs horizontal (~0°). */
export function orientationBucket(rotationRad: number): OrientationBucket {
  return Math.abs(normalizeRotation(rotationRad)) > degToRad(40)
    ? 'vertical'
    : 'horizontal';
}

export function groupByOrientationBucket(units: EditableUnit[]): EditableUnit[][] {
  const vertical: EditableUnit[] = [];
  const horizontal: EditableUnit[] = [];
  for (const u of units) {
    (orientationBucket(u.rotationRad) === 'vertical' ? vertical : horizontal).push(u);
  }
  return [vertical, horizontal].filter((g) => g.length >= 2);
}

function spread(values: number[]): number {
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function isRowStrip(strip: EditableUnit[]): boolean {
  if (strip.length < 2) return false;
  const cxs = strip.map((u) => u.bounds.cx);
  const cys = strip.map((u) => u.bounds.cy);
  return spread(cxs) > spread(cys) * 1.15;
}

export function isColStrip(strip: EditableUnit[]): boolean {
  if (strip.length < 2) return false;
  const cxs = strip.map((u) => u.bounds.cx);
  const cys = strip.map((u) => u.bounds.cy);
  return spread(cys) > spread(cxs) * 1.15;
}

/** Angle folded into [0, 90°) — orientation family of a rectangle. */
function angleMod90(rad: number): number {
  let a = rad % QUARTER;
  if (a < 0) a += QUARTER;
  return a;
}

function weightedMedian(items: { value: number; weight: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  let acc = 0;
  for (const i of sorted) {
    acc += i.weight;
    if (acc >= total / 2) return i.value;
  }
  return sorted[sorted.length - 1].value;
}

interface AngleCluster {
  /** Cluster center in mod-90 space. */
  center: number;
  indices: number[];
}

/**
 * Cluster orientations in circular mod-90 space. Sorts angles, opens the
 * circle at the largest gap, then splits wherever ADJACENT angles are more
 * than ANGLE_GAP_TOL apart (single-linkage — tolerates spread-out jitter
 * within one physical orientation without merging distinct ones).
 */
function clusterAngles(units: EditableUnit[]): AngleCluster[] {
  const items = units
    .map((u, i) => ({
      angle: angleMod90(u.rotationRad),
      weight: Math.max(1, u.bounds.width * u.bounds.height),
      index: i,
    }))
    .sort((a, b) => a.angle - b.angle);

  if (items.length === 0) return [];

  // Find the largest circular gap to use as the cut point.
  let cut = 0;
  let largestGap = -1;
  for (let i = 0; i < items.length; i++) {
    const next = items[(i + 1) % items.length];
    const gap =
      i === items.length - 1
        ? items[0].angle + QUARTER - items[i].angle
        : next.angle - items[i].angle;
    if (gap > largestGap) {
      largestGap = gap;
      cut = (i + 1) % items.length;
    }
  }
  const ordered = [...items.slice(cut), ...items.slice(0, cut)];
  // Unwrap so the sequence is monotonic from the cut point.
  const base = ordered[0].angle;
  const unwrapped = ordered.map((it) => ({
    ...it,
    angle: it.angle < base - 1e-9 ? it.angle + QUARTER : it.angle,
  }));

  const clusters: AngleCluster[] = [];
  let start = 0;
  for (let i = 1; i <= unwrapped.length; i++) {
    const closes =
      i === unwrapped.length || unwrapped[i].angle - unwrapped[i - 1].angle > ANGLE_GAP_TOL;
    if (!closes) continue;
    const run = unwrapped.slice(start, i);
    const center = angleMod90(
      weightedMedian(run.map((r) => ({ value: r.angle, weight: r.weight })))
    );
    clusters.push({ center, indices: run.map((r) => r.index) });
    start = i;
  }
  return clusters;
}

interface Edge {
  coord: number;
  /** Length of the wall segment — longer walls anchor the line more strongly. */
  weight: number;
  unit: number;
  side: 'lo' | 'hi';
}

/**
 * 1-D edge clustering: sort, group while the running spread stays within
 * `tol`, snap every member to the group's weighted mean.
 */
function snapEdges(edges: Edge[], tol: number): Map<number, { lo?: number; hi?: number }> {
  const sorted = [...edges].sort((a, b) => a.coord - b.coord);
  const out = new Map<number, { lo?: number; hi?: number }>();

  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const closes = i === sorted.length || sorted[i].coord - sorted[start].coord > tol;
    if (!closes) continue;
    const run = sorted.slice(start, i);
    if (run.length >= 2) {
      const total = run.reduce((s, e) => s + e.weight, 0);
      const mean = run.reduce((s, e) => s + e.coord * e.weight, 0) / Math.max(1e-9, total);
      for (const e of run) {
        const entry = out.get(e.unit) ?? {};
        entry[e.side] = mean;
        out.set(e.unit, entry);
      }
    }
    start = i;
  }
  return out;
}

interface FrameUnit {
  index: number;
  /** Center in the cluster frame. */
  fx: number;
  fy: number;
  /** Half extents along the frame axes. */
  hx: number;
  hy: number;
  /** True when the unit's local width lies along the frame x axis. */
  widthAlongX: boolean;
}

export function snapAlignUnits(
  units: EditableUnit[],
  options?: SnapAlignOptions
): EditableUnit[] {
  const opts = { ...DEFAULTS, ...options };
  const scopeIdx = units
    .map((_, i) => i)
    .filter((i) => !opts.onlyIds || opts.onlyIds.has(units[i].id));

  if (scopeIdx.length < 2) return units;

  const scope = scopeIdx.map((i) => units[i]);
  const maxRotRad = degToRad(opts.maxRotDeg);

  const next = units.map((u) => ({
    cx: u.bounds.cx,
    cy: u.bounds.cy,
    width: u.bounds.width,
    height: u.bounds.height,
    rotationRad: u.rotationRad,
  }));

  for (const cluster of clusterAngles(scope)) {
    // --- 1. Rotation snap ------------------------------------------------
    const members: number[] = [];
    for (const si of cluster.indices) {
      const gi = scopeIdx[si];
      const delta = shortestAxisDelta(next[gi].rotationRad, cluster.center);
      if (Math.abs(delta) > maxRotRad) continue;
      next[gi].rotationRad = normalizeRotation(next[gi].rotationRad + delta);
      members.push(gi);
    }
    if (members.length < 2) continue;

    // --- 2. Edge snap in the cluster frame --------------------------------
    const cos = Math.cos(cluster.center);
    const sin = Math.sin(cluster.center);
    const frame: FrameUnit[] = members.map((gi) => {
      const n = next[gi];
      // Rotate world center by -center into the frame.
      const fx = n.cx * cos + n.cy * sin;
      const fy = -n.cx * sin + n.cy * cos;
      // After rotation snap the unit's angle is center + k·90°: its width lies
      // along frame x for even k, along frame y for odd k.
      const k = Math.round((n.rotationRad - cluster.center) / QUARTER);
      const widthAlongX = ((k % 2) + 2) % 2 === 0;
      return {
        index: gi,
        fx,
        fy,
        hx: (widthAlongX ? n.width : n.height) / 2,
        hy: (widthAlongX ? n.height : n.width) / 2,
        widthAlongX,
      };
    });

    const shortSides = members
      .map((gi) => Math.min(next[gi].width, next[gi].height))
      .sort((a, b) => a - b);
    const medianShort = shortSides[Math.floor(shortSides.length / 2)];
    const tol = Math.max(1.5, medianShort * opts.edgeToleranceFraction);

    const xEdges: Edge[] = [];
    const yEdges: Edge[] = [];
    for (let m = 0; m < frame.length; m++) {
      const f = frame[m];
      xEdges.push(
        { coord: f.fx - f.hx, weight: 2 * f.hy, unit: m, side: 'lo' },
        { coord: f.fx + f.hx, weight: 2 * f.hy, unit: m, side: 'hi' }
      );
      yEdges.push(
        { coord: f.fy - f.hy, weight: 2 * f.hx, unit: m, side: 'lo' },
        { coord: f.fy + f.hy, weight: 2 * f.hx, unit: m, side: 'hi' }
      );
    }

    const xSnaps = snapEdges(xEdges, tol);
    const ySnaps = snapEdges(yEdges, tol);

    for (let m = 0; m < frame.length; m++) {
      const f = frame[m];
      const xs = xSnaps.get(m);
      const ys = ySnaps.get(m);

      const applyAxis = (
        center: number,
        half: number,
        snap: { lo?: number; hi?: number } | undefined
      ): { center: number; half: number } => {
        const lo = snap?.lo ?? center - half;
        const hi = snap?.hi ?? center + half;
        const newHalf = (hi - lo) / 2;
        if (Math.abs(newHalf - half) / Math.max(1e-9, half) > MAX_SIZE_CHANGE_FRACTION) {
          // Size change too large — translate to the snapped midpoint, keep size.
          return { center: (lo + hi) / 2, half };
        }
        return { center: (lo + hi) / 2, half: newHalf };
      };

      const ax = applyAxis(f.fx, f.hx, xs);
      const ay = applyAxis(f.fy, f.hy, ys);

      const n = next[f.index];
      n.cx = ax.center * cos - ay.center * sin;
      n.cy = ax.center * sin + ay.center * cos;
      if (f.widthAlongX) {
        n.width = ax.half * 2;
        n.height = ay.half * 2;
      } else {
        n.width = ay.half * 2;
        n.height = ax.half * 2;
      }
    }
  }

  let changed = false;
  const out = units.map((u, i) => {
    const n = next[i];
    const moved =
      Math.abs(n.cx - u.bounds.cx) > 0.01 ||
      Math.abs(n.cy - u.bounds.cy) > 0.01 ||
      Math.abs(n.width - u.bounds.width) > 0.01 ||
      Math.abs(n.height - u.bounds.height) > 0.01 ||
      Math.abs(shortestAngleDelta(u.rotationRad, n.rotationRad)) > 0.0001;
    if (!moved) return u;
    changed = true;
    return {
      ...u,
      bounds: { cx: n.cx, cy: n.cy, width: n.width, height: n.height },
      rotationRad: n.rotationRad,
      edited: true,
    };
  });

  return changed ? out : units;
}
