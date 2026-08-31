/**
 * BluDesign Layout Import — Automatic door-side assignment
 *
 * A best-effort, rule-based first pass that decides which edge of each unit the
 * door sits on, and where along that edge. It is intentionally simple and fully
 * overridable — the user can change any door afterwards.
 *
 * IMPORTANT: every unit is reasoned about in *its own local (un-rotated) frame*.
 * The plans this tool targets have rows tilted at arbitrary angles, so a global
 * axis-aligned model is wrong — adjacent units in a tilted row have heavily
 * overlapping bounding boxes, which makes their shared side-walls look "open".
 * By projecting each neighbour into the current unit's local frame, the four
 * door sides (top/bottom/left/right) line up with real walls and adjacency is
 * exact regardless of rotation.
 *
 * The model is built around the *free interval* of each edge: the run(s) of an
 * edge that are NOT abutted by an immediately-adjacent unit. A door must live in
 * a free run, from which the rules fall out:
 *
 *  1. A door never opens into an adjacent unit: the part of an edge covered by a
 *     nearby neighbour is removed from the free interval (a shared wall is fully
 *     covered, so it can host no door at all).
 *  2. Doors face the interior / a drive aisle, not off the plan: a side with no
 *     unit beyond it (open exterior) is avoided unless nothing else can host a
 *     door. Units across a real aisle do NOT block each other (the gap is wide),
 *     so opposing rows simply face into the shared aisle.
 *  3. Adjacent units in a row face the same way (majority alignment).
 *  4. Doors stay centered at 80% of the edge by default; when the free run is
 *     smaller (a neighbour covers part of the edge), the door is offset into the
 *     open run and narrowed so the unit can still be accessed.
 */

import type { DoorSide, EditableUnit, UnitDoor } from './types';
import { DEFAULT_DOOR_WIDTH_FRACTION } from './types';
import { clampDoorOffset, doorEdgeLength, rectCorners, toLocal, toWorld } from './geometry';
import { discoverSpatialChains } from './labelResolution';

type Interval = [number, number];

const SIDES: DoorSide[] = ['top', 'bottom', 'left', 'right'];

/** Axis-aligned box in some frame (self = local frame, neighbours = projected). */
interface Box {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Everything needed to reason about one unit, in its own local frame. */
interface UnitCtx {
  id: string;
  cx: number;
  cy: number;
  rot: number;
  w: number;
  h: number;
  self: Box;
  neighbors: Box[];
}

function isVertical(side: DoorSide): boolean {
  return side === 'left' || side === 'right';
}

/** Local-frame outward normal for a side. */
function outwardNormal(side: DoorSide): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

/** Size of a box along a side's outward normal. */
function normalSpan(box: Box, side: DoorSide): number {
  return isVertical(side) ? box.w : box.h;
}

/** Signed gap from `box`'s edge to `other` along the side's outward normal. */
function normalGap(box: Box, side: DoorSide, other: Box): number {
  switch (side) {
    case 'right':
      return other.minX - box.maxX;
    case 'left':
      return box.minX - other.maxX;
    case 'bottom':
      return other.minY - box.maxY;
    case 'top':
      return box.minY - other.maxY;
  }
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Subtract `cut` from a set of 1-D intervals. */
function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const res: Interval[] = [];
  for (const [s, e] of intervals) {
    if (cut[1] <= s || cut[0] >= e) {
      res.push([s, e]);
      continue;
    }
    if (cut[0] > s) res.push([s, cut[0]]);
    if (cut[1] < e) res.push([cut[1], e]);
  }
  return res.filter(([s, e]) => e - s > 1e-6);
}

/**
 * Free run(s) along a side's edge — the parts NOT abutted by a nearby unit, so a
 * door placed there can never open into another unit. `clearance` separates a
 * shared wall / back-to-back seam (small gap → blocks) from a unit across a
 * drive aisle (large gap → doesn't block). It scales with the unit's *smaller*
 * dimension so it catches packed seams without swallowing real aisles.
 */
function freeIntervals(ctx: UnitCtx, side: DoorSide): Interval[] {
  const box = ctx.self;
  const vertical = isVertical(side);
  const lo = vertical ? box.minY : box.minX;
  const hi = vertical ? box.maxY : box.maxX;
  const clearance = Math.max(24, 0.75 * Math.min(ctx.w, ctx.h));
  const overlapTol = 0.3 * normalSpan(box, side);

  let intervals: Interval[] = [[lo, hi]];
  for (const other of ctx.neighbors) {
    const gap = normalGap(box, side, other);
    if (gap > clearance) continue; // across an aisle → not blocking
    if (gap < -overlapTol) continue; // not actually in front of this edge
    const os = vertical ? other.minY : other.minX;
    const oe = vertical ? other.maxY : other.maxX;
    if (oe <= lo || os >= hi) continue; // doesn't overlap the edge span
    intervals = subtract(intervals, [Math.max(lo, os), Math.min(hi, oe)]);
    if (intervals.length === 0) break;
  }
  return intervals;
}

/**
 * Is there any other unit out beyond this edge (at any distance) overlapping the
 * edge's span? If not, the side faces open exterior space — a door there would
 * open "outward", which we avoid.
 */
function hasUnitsBeyond(ctx: UnitCtx, side: DoorSide): boolean {
  const box = ctx.self;
  const vertical = isVertical(side);
  const lo = vertical ? box.minY : box.minX;
  const hi = vertical ? box.maxY : box.maxX;
  const span = normalSpan(box, side);
  const tol = 0.1 * (vertical ? box.h : box.w);
  for (const other of ctx.neighbors) {
    if (normalGap(box, side, other) < -0.3 * span) continue; // must be outward
    const os = vertical ? other.minY : other.minX;
    const oe = vertical ? other.maxY : other.maxX;
    if (overlap(lo, hi, os, oe) > tol) return true;
  }
  return false;
}

function intervalLen(i: Interval): number {
  return i[1] - i[0];
}

function largest(intervals: Interval[]): Interval | null {
  let best: Interval | null = null;
  for (const i of intervals) {
    if (!best || intervalLen(i) > intervalLen(best)) best = i;
  }
  return best;
}

interface SideInfo {
  side: DoorSide;
  free: Interval[];
  freeLen: number;
  /** True when the side faces open exterior space (no units beyond it). */
  exterior: boolean;
  /** How strongly the side faces the layout centroid (+ = toward interior). */
  interiorScore: number;
  /** Distance from the unit edge to the image border along this side. */
  bd: number;
  usable: boolean;
}

function analyzeSides(
  ctx: UnitCtx,
  localCentroid: { x: number; y: number },
  imgW: number,
  imgH: number
): SideInfo[] {
  return SIDES.map((side) => {
    const free = freeIntervals(ctx, side);
    const freeLen = free.reduce((s, i) => s + intervalLen(i), 0);
    const n = outwardNormal(side);
    const interiorScore = n.x * localCentroid.x + n.y * localCentroid.y;
    const minDoor = Math.max(8, 0.25 * (isVertical(side) ? ctx.h : ctx.w));
    return {
      side,
      free,
      freeLen,
      exterior: !hasUnitsBeyond(ctx, side),
      interiorScore,
      bd: borderDistance(ctx, side, imgW, imgH),
      usable: freeLen >= minDoor,
    };
  });
}

/** Distance from the unit center to the image border along the side's world normal. */
function borderDistance(ctx: UnitCtx, side: DoorSide, imgW: number, imgH: number): number {
  const ln = outwardNormal(side);
  const n = toWorld(ln.x, ln.y, ctx.rot);
  let best = Infinity;
  if (Math.abs(n.x) > 1e-6) {
    const t = n.x > 0 ? (imgW - ctx.cx) / n.x : (0 - ctx.cx) / n.x;
    if (t >= 0) best = Math.min(best, t);
  }
  if (Math.abs(n.y) > 1e-6) {
    const t = n.y > 0 ? (imgH - ctx.cy) / n.y : (0 - ctx.cy) / n.y;
    if (t >= 0) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

function sideRank(a: SideInfo, b: SideInfo): number {
  return b.interiorScore - a.interiorScore || b.freeLen - a.freeLen || b.bd - a.bd;
}

/** Sides of `ctx` that share a wall with another unit in the same spatial chain. */
function sidesBlockedByChainNeighbors(ctx: UnitCtx, chainIds: Set<string>): Set<DoorSide> {
  const blocked = new Set<DoorSide>();
  const box = ctx.self;
  const clearance = Math.max(24, 0.75 * Math.min(ctx.w, ctx.h));
  for (const other of ctx.neighbors) {
    if (!chainIds.has(other.id)) continue;
    for (const side of SIDES) {
      const gap = normalGap(box, side, other);
      if (gap > clearance || gap < -0.3 * normalSpan(box, side)) continue;
      const vertical = isVertical(side);
      const lo = vertical ? box.minY : box.minX;
      const hi = vertical ? box.maxY : box.maxX;
      const os = vertical ? other.minY : other.minX;
      const oe = vertical ? other.maxY : other.maxX;
      if (overlap(lo, hi, os, oe) >= 0.5 * (hi - lo)) blocked.add(side);
    }
  }
  return blocked;
}

/** Aisle-facing edge pair for a chain — the two sides not shared with chain neighbors. */
function aisleSidesForChain(
  chain: EditableUnit[],
  ctxById: Map<string, UnitCtx>
): DoorSide[] {
  const chainIds = new Set(chain.map((u) => u.id));
  let topBottom = 0;
  let leftRight = 0;
  for (const u of chain) {
    const blocked = sidesBlockedByChainNeighbors(ctxById.get(u.id)!, chainIds);
    if (!blocked.has('top') && !blocked.has('bottom')) topBottom++;
    if (!blocked.has('left') && !blocked.has('right')) leftRight++;
  }
  return topBottom >= leftRight ? ['top', 'bottom'] : ['left', 'right'];
}

function chooseSide(info: SideInfo[]): DoorSide {
  const rank = (a: SideInfo, b: SideInfo) => sideRank(a, b);
  const tiers: SideInfo[][] = [
    info.filter((s) => s.usable && !s.exterior),
    info.filter((s) => s.freeLen > 0 && !s.exterior),
    info.filter((s) => s.usable),
    info.filter((s) => s.freeLen > 0),
  ];
  for (const tier of tiers) {
    if (tier.length) return [...tier].sort(rank)[0].side;
  }
  return [...info].sort(rank)[0].side;
}

/**
 * Two units are row/column neighbours if, in this unit's local frame, the other
 * sits flush against one side (small gap) sharing most of that wall.
 */
function neighborSides(ctx: UnitCtx): Set<string> {
  const ids = new Set<string>();
  const box = ctx.self;
  const clearance = Math.max(24, 0.75 * Math.min(ctx.w, ctx.h));
  for (const other of ctx.neighbors) {
    for (const side of SIDES) {
      const gap = normalGap(box, side, other);
      if (gap > clearance || gap < -0.3 * normalSpan(box, side)) continue;
      const vertical = isVertical(side);
      const lo = vertical ? box.minY : box.minX;
      const hi = vertical ? box.maxY : box.maxX;
      const os = vertical ? other.minY : other.minX;
      const oe = vertical ? other.maxY : other.maxX;
      if (overlap(lo, hi, os, oe) >= 0.5 * (hi - lo)) {
        ids.add(other.id);
        break;
      }
    }
  }
  return ids;
}

/**
 * Nudge each unit toward its neighbours' door side when that side is also a
 * valid interior opening here. Repeated so choices propagate along a row.
 */
function alignWithNeighbors(
  sides: Map<string, DoorSide>,
  infoById: Map<string, SideInfo[]>,
  adj: Map<string, Set<string>>,
  _ctxById: Map<string, UnitCtx>
): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const [id, neighbors] of adj) {
      if (neighbors.size === 0) continue;
      const votes = new Map<DoorSide, number>();
      for (const nId of neighbors) {
        const s = sides.get(nId);
        if (s) votes.set(s, (votes.get(s) ?? 0) + 1);
      }
      let majority: DoorSide | null = null;
      let count = 0;
      for (const [s, c] of votes) {
        if (c > count) {
          count = c;
          majority = s;
        }
      }
      if (!majority || majority === sides.get(id)) continue;
      const cand = infoById.get(id)!.find((s) => s.side === majority);
      if (cand && cand.usable && !cand.exterior) {
        sides.set(id, majority);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** Force a consistent frontage side across each spatial row/column chain. */
function harmonizeChainDoorSides(
  units: EditableUnit[],
  sides: Map<string, DoorSide>,
  infoById: Map<string, SideInfo[]>,
  ctxById: Map<string, UnitCtx>
): void {
  const { rows, cols } = discoverSpatialChains(units);

  const applyChain = (chain: EditableUnit[], allowed: DoorSide[]) => {
    if (chain.length < 2) return;

    // Strict pass: only interior-facing sides vote. If the whole chain has no
    // interior side (an isolated row — both frontages open), relax to any
    // usable side so the row still agrees on one direction.
    const tally = (requireInterior: boolean) => {
      const scoreBySide = new Map<DoorSide, number>();
      const votes = new Map<DoorSide, number>();
      for (const u of chain) {
        for (const side of allowed) {
          const info = infoById.get(u.id)!.find((s) => s.side === side);
          if (!info?.usable || (requireInterior && info.exterior)) continue;
          votes.set(side, (votes.get(side) ?? 0) + 1);
          scoreBySide.set(side, (scoreBySide.get(side) ?? 0) + info.interiorScore);
        }
      }
      return { votes, scoreBySide };
    };

    let requireInterior = true;
    let { votes, scoreBySide } = tally(true);
    if (votes.size === 0) {
      requireInterior = false;
      ({ votes, scoreBySide } = tally(false));
    }

    let best: DoorSide | null = null;
    let bestVotes = 0;
    let bestScore = -Infinity;
    for (const side of allowed) {
      const count = votes.get(side) ?? 0;
      const score = scoreBySide.get(side) ?? -Infinity;
      if (count > bestVotes || (count === bestVotes && score > bestScore)) {
        best = side;
        bestVotes = count;
        bestScore = score;
      }
    }
    if (!best || bestVotes === 0) return;

    for (const u of chain) {
      const cand = infoById.get(u.id)!.find((s) => s.side === best);
      if (cand?.usable && (!requireInterior || !cand.exterior)) {
        sides.set(u.id, best);
        continue;
      }
      // Majority side is blocked here — try the other allowed side, otherwise
      // keep the per-unit choice. Never force a door onto a blocked wall.
      const fallback = allowed
        .map((s) => infoById.get(u.id)!.find((i) => i.side === s))
        .filter((info): info is SideInfo => !!info && info.usable && !info.exterior)
        .sort(sideRank)[0];
      if (fallback) sides.set(u.id, fallback.side);
    }
  };

  for (const chain of rows) {
    if (chain.length >= 2) applyChain(chain, aisleSidesForChain(chain, ctxById));
  }
  for (const chain of cols) {
    if (chain.length >= 3) applyChain(chain, aisleSidesForChain(chain, ctxById));
  }
}

/** Row/col units must pick an aisle-facing side, not a wall shared with chain neighbors. */
function enforceChainFrontage(
  units: EditableUnit[],
  sides: Map<string, DoorSide>,
  infoById: Map<string, SideInfo[]>,
  ctxById: Map<string, UnitCtx>
): void {
  const { rows, cols } = discoverSpatialChains(units);

  const fixUnit = (u: EditableUnit, allowed: DoorSide[]) => {
    const side = sides.get(u.id);
    if (side && allowed.includes(side)) return;
    const candidates = allowed
      .map((s) => infoById.get(u.id)!.find((i) => i.side === s))
      .filter(
        (info): info is SideInfo => !!info && info.usable && !info.exterior
      )
      .sort(sideRank);
    if (candidates[0]) sides.set(u.id, candidates[0].side);
  };

  for (const chain of rows) {
    const allowed = aisleSidesForChain(chain, ctxById);
    for (const u of chain) fixUnit(u, allowed);
  }
  for (const chain of cols) {
    if (chain.length < 3) continue;
    const allowed = aisleSidesForChain(chain, ctxById);
    for (const u of chain) fixUnit(u, allowed);
  }
}

/** Place a centered 80% door, or offset+narrow it into the open run if blocked. */
function placeDoor(side: DoorSide, info: SideInfo, edgeLen: number): UnitDoor {
  const lo = -edgeLen / 2;
  const hi = edgeLen / 2;
  const center = 0;

  const run = largest(info.free) ?? [lo, hi];
  const runLen = intervalLen(run);

  let widthFraction = DEFAULT_DOOR_WIDTH_FRACTION;
  let doorLen = widthFraction * edgeLen;
  let doorCenter = center;

  const centeredFits =
    center - doorLen / 2 >= run[0] - 1e-6 && center + doorLen / 2 <= run[1] + 1e-6;
  if (!centeredFits) {
    doorCenter = (run[0] + run[1]) / 2;
    doorLen = Math.min(doorLen, 0.9 * runLen);
    widthFraction = edgeLen > 0 ? doorLen / edgeLen : DEFAULT_DOOR_WIDTH_FRACTION;
  }

  const offsetFraction = clampDoorOffset(edgeLen > 0 ? (doorCenter - center) / edgeLen : 0, widthFraction);
  return { side, widthFraction: Math.max(0.1, Math.min(1, widthFraction)), offsetFraction, auto: true };
}

/** Build a unit's context: itself and every other unit projected into its local frame. */
function buildContext(unit: EditableUnit, all: EditableUnit[]): UnitCtx {
  const cx = unit.bounds.cx;
  const cy = unit.bounds.cy;
  const rot = unit.rotationRad;
  const w = unit.bounds.width;
  const h = unit.bounds.height;
  const self: Box = {
    id: unit.id,
    minX: -w / 2,
    maxX: w / 2,
    minY: -h / 2,
    maxY: h / 2,
    cx: 0,
    cy: 0,
    w,
    h,
  };
  const neighbors: Box[] = [];
  for (const other of all) {
    if (other.id === unit.id) continue;
    const corners = rectCorners(other.bounds, other.rotationRad).map((p) =>
      toLocal(p.x - cx, p.y - cy, rot)
    );
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    neighbors.push({
      id: other.id,
      minX,
      maxX,
      minY,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: maxX - minX,
      h: maxY - minY,
    });
  }
  return { id: unit.id, cx, cy, rot, w, h, self, neighbors };
}

/**
 * Assign a door to every unit. Units whose door is already user-set
 * (`door.auto === false`) are left untouched.
 */
export function assignDoors(
  units: EditableUnit[],
  imageWidth: number,
  imageHeight: number
): EditableUnit[] {
  if (units.length === 0) return units;

  const centroidWorld = {
    x: units.reduce((s, u) => s + u.bounds.cx, 0) / units.length,
    y: units.reduce((s, u) => s + u.bounds.cy, 0) / units.length,
  };

  const ctxById = new Map<string, UnitCtx>();
  const infoById = new Map<string, SideInfo[]>();
  for (const u of units) {
    const ctx = buildContext(u, units);
    ctxById.set(u.id, ctx);
    const localCentroid = toLocal(centroidWorld.x - ctx.cx, centroidWorld.y - ctx.cy, ctx.rot);
    infoById.set(u.id, analyzeSides(ctx, localCentroid, imageWidth, imageHeight));
  }

  // 1) Initial inside-facing side with room (prefer short frontage edges).
  const sides = new Map<string, DoorSide>();
  for (const u of units) sides.set(u.id, chooseSide(infoById.get(u.id)!));

  // 2/3) Neighbour + chain alignment.
  const adj = new Map<string, Set<string>>();
  for (const u of units) adj.set(u.id, neighborSides(ctxById.get(u.id)!));
  alignWithNeighbors(sides, infoById, adj, ctxById);
  harmonizeChainDoorSides(units, sides, infoById, ctxById);
  enforceChainFrontage(units, sides, infoById, ctxById);

  // 4) Place each door (centered, or offset+narrow into the open run).
  const doors = new Map<string, UnitDoor>();
  for (const u of units) {
    const side = sides.get(u.id)!;
    const info = infoById.get(u.id)!.find((s) => s.side === side)!;
    doors.set(u.id, placeDoor(side, info, doorEdgeLength(u.bounds, side)));
  }

  return units.map((u) => {
    if (u.door && u.door.auto === false) return u;
    const door = doors.get(u.id);
    if (!door || doorEdgeLength(u.bounds, door.side) <= 0) return u;
    return { ...u, door };
  });
}
