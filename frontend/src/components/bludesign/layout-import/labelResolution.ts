/**
 * Auto-resolve missing / wrong unit labels using numeric neighbors.
 *
 * Handles:
 *  - Empty slots in a run (… 71, ?, 73 → 72)
 *  - OCR misreads sandwiched in a run (… 70, "2", 72 → 71)
 *  - Transposed digits (… 30, "13", 38 → 31 because 13↔31)
 *  - Corner fills in a grid (48 left + 50 above → 49)
 *
 * Runs up to N passes across horizontal rows, vertical columns, and corners.
 */

import { aabb } from './geometry';
import type { EditableUnit } from './types';

export interface ParsedNumericLabel {
  num: number;
  suffix: string;
  /** Display form, e.g. "72" or "72a". */
  text: string;
}

/** Parse a unit label into a numeric core + optional letter suffix. */
export function parseNumericLabel(label?: string): ParsedNumericLabel | null {
  const trimmed = (label ?? '').trim();
  const match = trimmed.match(/^(\d+)\s*([A-Za-z]?)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const suffix = (match[2] || '').toLowerCase();
  return { num, suffix, text: suffix ? `${num}${suffix}` : `${num}` };
}

function unitArea(u: EditableUnit): number {
  return u.bounds.width * u.bounds.height;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function makeLabel(num: number, suffix: string): ParsedNumericLabel {
  return { num, suffix, text: suffix ? `${num}${suffix}` : `${num}` };
}

/** True when reversing the digits of `a` yields `b` (common OCR swap: 13↔31). */
export function isDigitTransposition(a: number, b: number): boolean {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length || sa.length < 2) return false;
  return sa.split('').reverse().join('') === sb;
}

/** Group units into horizontal rows by similar center-y. @deprecated Prefer discoverSpatialChains */
export function clusterRows(units: EditableUnit[]): EditableUnit[][] {
  if (units.length === 0) return [];
  const heights = units.map((u) => u.bounds.height).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 20;
  const tol = medH * 0.75;

  const sorted = [...units].sort((a, b) => a.bounds.cy - b.bounds.cy);
  const rows: EditableUnit[][] = [];
  let current: EditableUnit[] = [];
  let anchorCy = sorted[0].bounds.cy;

  for (const u of sorted) {
    if (current.length === 0 || Math.abs(u.bounds.cy - anchorCy) <= tol) {
      current.push(u);
    } else {
      rows.push(current);
      current = [u];
      anchorCy = u.bounds.cy;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

/** Group units into vertical columns by similar center-x. @deprecated Prefer discoverSpatialChains */
export function clusterColumns(units: EditableUnit[]): EditableUnit[][] {
  if (units.length === 0) return [];
  const widths = units.map((u) => u.bounds.width).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)] || 20;
  const tol = medW * 0.75;

  const sorted = [...units].sort((a, b) => a.bounds.cx - b.bounds.cx);
  const cols: EditableUnit[][] = [];
  let current: EditableUnit[] = [];
  let anchorCx = sorted[0].bounds.cx;

  for (const u of sorted) {
    if (current.length === 0 || Math.abs(u.bounds.cx - anchorCx) <= tol) {
      current.push(u);
    } else {
      cols.push(current);
      current = [u];
      anchorCx = u.bounds.cx;
    }
  }
  if (current.length) cols.push(current);
  return cols;
}

function unitShortSide(u: EditableUnit): number {
  return Math.min(u.bounds.width, u.bounds.height);
}

function unitLongSide(u: EditableUnit): number {
  return Math.max(u.bounds.width, u.bounds.height);
}

/** Typical center-to-center spacing along a row/column (short edge for rotated cells). */
function chainStep(a: EditableUnit, b: EditableUnit): number {
  const short = (unitShortSide(a) + unitShortSide(b)) / 2;
  const long = (unitLongSide(a) + unitLongSide(b)) / 2;
  const dx = Math.abs(a.bounds.cx - b.bounds.cx);
  const dy = Math.abs(a.bounds.cy - b.bounds.cy);
  if (dx > dy * 1.5) return Math.max(short, long * 0.85);
  return short;
}

function crossTolerance(a: EditableUnit, b: EditableUnit): number {
  return ((unitShortSide(a) + unitShortSide(b)) / 2) * 0.65;
}

function isHorizontalNeighbor(a: EditableUnit, b: EditableUnit): boolean {
  const dx = Math.abs(a.bounds.cx - b.bounds.cx);
  const dy = Math.abs(a.bounds.cy - b.bounds.cy);
  const dist = Math.hypot(dx, dy);
  const step = chainStep(a, b);
  const minAlong = step * 0.45;
  const maxAlong = step * 1.7;
  if (dist >= minAlong && dist <= maxAlong && dy <= crossTolerance(a, b)) return true;
  return isRotatedRowNeighbor(a, b);
}

function isRotatedRowNeighbor(a: EditableUnit, b: EditableUnit): boolean {
  const avgRot = (a.rotationRad + b.rotationRad) / 2;
  const dx = b.bounds.cx - a.bounds.cx;
  const dy = b.bounds.cy - a.bounds.cy;
  const along = dx * Math.cos(avgRot) + dy * Math.sin(avgRot);
  const cross = -dx * Math.sin(avgRot) + dy * Math.cos(avgRot);
  const step = chainStep(a, b);
  if (Math.abs(along) < step * 0.45 || Math.abs(along) > step * 1.7) return false;
  return Math.abs(cross) <= crossTolerance(a, b);
}

function isVerticalNeighbor(a: EditableUnit, b: EditableUnit): boolean {
  const dx = Math.abs(a.bounds.cx - b.bounds.cx);
  const dy = Math.abs(a.bounds.cy - b.bounds.cy);
  const dist = Math.hypot(dx, dy);
  const step = chainStep(a, b);
  const minAlong = step * 0.45;
  const maxAlong = step * 1.7;
  if (dist < minAlong || dist > maxAlong) return false;
  return dx <= crossTolerance(a, b);
}

function isVerticalNeighborRelaxed(a: EditableUnit, b: EditableUnit): boolean {
  const dx = Math.abs(a.bounds.cx - b.bounds.cx);
  const dy = Math.abs(a.bounds.cy - b.bounds.cy);
  const dist = Math.hypot(dx, dy);
  const step = chainStep(a, b);
  const minAlong = step * 0.45;
  const maxAlong = step * 1.7;
  if (dist < minAlong || dist > maxAlong) return false;
  return dx <= crossTolerance(a, b) * 1.5;
}

function buildTouchingChains(
  units: EditableUnit[],
  isNeighbor: (a: EditableUnit, b: EditableUnit) => boolean,
  sortKey: 'cx' | 'cy'
): EditableUnit[][] {
  const used = new Set<string>();
  const chains: EditableUnit[][] = [];
  const sorted = [...units].sort((a, b) =>
    sortKey === 'cx'
      ? a.bounds.cx - b.bounds.cx || a.bounds.cy - b.bounds.cy
      : a.bounds.cy - b.bounds.cy || a.bounds.cx - b.bounds.cx
  );

  for (const start of sorted) {
    if (used.has(start.id)) continue;

    let leftmost = start;
    for (;;) {
      const prev = units
        .filter(
          (u) =>
            u.id !== leftmost.id &&
            !used.has(u.id) &&
            isNeighbor(leftmost, u) &&
            u.bounds[sortKey] < leftmost.bounds[sortKey]
        )
        .sort((a, b) => b.bounds[sortKey] - a.bounds[sortKey]);
      if (prev.length === 0) break;
      leftmost = prev[0];
    }

    const chain: EditableUnit[] = [leftmost];
    used.add(leftmost.id);
    let curr = leftmost;
    for (;;) {
      const next = units
        .filter(
          (u) =>
            u.id !== curr.id &&
            !used.has(u.id) &&
            isNeighbor(curr, u) &&
            u.bounds[sortKey] > curr.bounds[sortKey]
        )
        .sort((a, b) => a.bounds[sortKey] - b.bounds[sortKey]);
      if (next.length === 0) break;
      curr = next[0];
      chain.push(curr);
      used.add(curr.id);
    }

    if (chain.length >= 2) chains.push(chain);
  }

  return chains;
}

/** Spatially adjacent row/column chains via touching neighbors (grid-safe). */
export function discoverSpatialChains(units: EditableUnit[]): {
  rows: EditableUnit[][];
  cols: EditableUnit[][];
} {
  const rows = buildTouchingChains(units, isHorizontalNeighbor, 'cx');
  const cols = buildTouchingChains(units, isVerticalNeighbor, 'cy');
  return { rows, cols };
}

interface LinearNeighbors {
  left: ParsedNumericLabel | null;
  right: ParsedNumericLabel | null;
}

function linearNeighbors(sorted: EditableUnit[], index: number): LinearNeighbors {
  let left: ParsedNumericLabel | null = null;
  let right: ParsedNumericLabel | null = null;
  for (let j = index - 1; j >= 0; j--) {
    const p = parseNumericLabel(sorted[j].label);
    if (p) {
      left = p;
      break;
    }
  }
  for (let j = index + 1; j < sorted.length; j++) {
    const p = parseNumericLabel(sorted[j].label);
    if (p) {
      right = p;
      break;
    }
  }
  return { left, right };
}

/**
 * When multiple empty slots sit between two labeled neighbors, fill each slot
 * with the sequential value (e.g. 55, ?, ?, 58 → 56, 57).
 */
function inferLinearGapFill(
  sorted: EditableUnit[],
  leftIdx: number,
  rightIdx: number
): Map<string, ParsedNumericLabel> | null {
  const left = parseNumericLabel(sorted[leftIdx].label);
  const right = parseNumericLabel(sorted[rightIdx].label);
  if (!left || !right || left.suffix !== right.suffix) return null;

  const gap = rightIdx - leftIdx - 1;
  if (gap <= 0) return null;

  const increasing = right.num - left.num === gap + 1;
  const decreasing = left.num - right.num === gap + 1;
  if (!increasing && !decreasing) return null;

  const out = new Map<string, ParsedNumericLabel>();
  for (let k = 1; k <= gap; k++) {
    const idx = leftIdx + k;
    const num = increasing ? left.num + k : left.num - k;
    out.set(sorted[idx].id, makeLabel(num, left.suffix));
  }
  return out;
}

function labeledNeighborIndices(sorted: EditableUnit[], index: number): {
  leftIdx: number;
  rightIdx: number;
} {
  let leftIdx = -1;
  for (let j = index - 1; j >= 0; j--) {
    if (parseNumericLabel(sorted[j].label)) {
      leftIdx = j;
      break;
    }
  }
  let rightIdx = -1;
  for (let j = index + 1; j < sorted.length; j++) {
    if (parseNumericLabel(sorted[j].label)) {
      rightIdx = j;
      break;
    }
  }
  return { leftIdx, rightIdx };
}

/**
 * When immediate labeled neighbors differ by exactly 2, the middle must be
 * left.num ± 1 (supports increasing and decreasing runs).
 */
function inferLinearMiddle(neighbors: LinearNeighbors): ParsedNumericLabel | null {
  const { left, right } = neighbors;
  if (!left || !right) return null;
  if (left.suffix !== right.suffix) return null;
  if (right.num - left.num === 2) return makeLabel(left.num + 1, left.suffix);
  if (left.num - right.num === 2) return makeLabel(left.num - 1, left.suffix);
  return null;
}

function hasVerticalTouchingNeighbor(units: EditableUnit[], target: EditableUnit): boolean {
  return units.some((u) => u.id !== target.id && isVerticalNeighbor(target, u));
}

function hasHorizontalTouchingNeighbor(units: EditableUnit[], target: EditableUnit): boolean {
  return units.some((u) => u.id !== target.id && isHorizontalNeighbor(target, u));
}

function labeledVerticalNeighbors(
  units: EditableUnit[],
  target: EditableUnit
): { above: ParsedNumericLabel | null; below: ParsedNumericLabel | null } {
  const { above, below } = findCardinalNeighbors(units, target, neighborSearchRadius(units));
  return {
    above: above ? parseNumericLabel(above.label) : null,
    below: below ? parseNumericLabel(below.label) : null,
  };
}

function labeledHorizontalNeighbors(
  units: EditableUnit[],
  target: EditableUnit
): { left: ParsedNumericLabel | null; right: ParsedNumericLabel | null } {
  const { left, right } = findCardinalNeighbors(units, target, neighborSearchRadius(units));
  return {
    left: left ? parseNumericLabel(left.label) : null,
    right: right ? parseNumericLabel(right.label) : null,
  };
}

function perpendicularConsistent(
  units: EditableUnit[],
  target: EditableUnit,
  candidate: ParsedNumericLabel,
  sortKey: 'cx' | 'cy'
): boolean {
  if (sortKey === 'cx') {
    if (!hasVerticalTouchingNeighbor(units, target)) return true;
    const vert = labeledVerticalNeighbors(units, target);
    if (vert.above && Math.abs(vert.above.num - candidate.num) === 1 && candidate.num !== vert.above.num + 1) {
      return false;
    }
    if (vert.below && Math.abs(vert.below.num - candidate.num) === 1 && candidate.num !== vert.below.num - 1) {
      return false;
    }
    return true;
  }

  if (!hasHorizontalTouchingNeighbor(units, target)) return true;
  const horiz = labeledHorizontalNeighbors(units, target);
  if (horiz.left && Math.abs(horiz.left.num - candidate.num) === 1 && candidate.num !== horiz.left.num + 1) {
    return false;
  }
  if (horiz.right && Math.abs(horiz.right.num - candidate.num) === 1 && candidate.num !== horiz.right.num - 1) {
    return false;
  }
  return true;
}

function chainNumberDirection(ordered: EditableUnit[]): 'increasing' | 'decreasing' | null {
  let first: ParsedNumericLabel | null = null;
  let last: ParsedNumericLabel | null = null;
  for (const u of ordered) {
    const p = parseNumericLabel(u.label);
    if (!p) continue;
    if (!first) first = p;
    last = p;
  }
  if (!first || !last || first.num === last.num) return null;
  return last.num > first.num ? 'increasing' : 'decreasing';
}

function preferSingleSideCandidate(
  a: ParsedNumericLabel,
  b: ParsedNumericLabel,
  sortKey: 'cx' | 'cy',
  ordered: EditableUnit[],
  index: number,
  neighbors: LinearNeighbors
): ParsedNumericLabel {
  if (index === 0 && neighbors.right && !neighbors.left) {
    return a.num < b.num ? a : b;
  }
  if (index === ordered.length - 1 && neighbors.left && !neighbors.right) {
    return a.num > b.num ? a : b;
  }
  if (index > 0 && !parseNumericLabel(ordered[index - 1].label)) {
    return a.num > b.num ? a : b;
  }
  if (sortKey === 'cy') {
    const dir = chainNumberDirection(ordered);
    if (dir === 'increasing') return a.num < b.num ? a : b;
    if (dir === 'decreasing') return a.num > b.num ? a : b;
  }
  return a.num > b.num ? a : b;
}

interface AdjacentSwap {
  selfId: string;
  self: ParsedNumericLabel;
  partnerId: string;
  partner: ParsedNumericLabel;
}

/** Correct two adjacent cells whose labels are reversed in an increasing/decreasing run. */
function inferAdjacentSwap(
  ordered: EditableUnit[],
  index: number,
  neighbors: LinearNeighbors
): AdjacentSwap | null {
  const current = parseNumericLabel(ordered[index].label);
  if (!current) return null;
  const { left, right } = neighbors;

  if (left && right && left.suffix === right.suffix && left.suffix === current.suffix) {
    if (right.num === left.num + 1 && left.num === current.num + 1) {
      return {
        selfId: ordered[index].id,
        self: makeLabel(left.num, current.suffix),
        partnerId: ordered[index - 1].id,
        partner: makeLabel(current.num, current.suffix),
      };
    }
    if (left.num === right.num + 1 && left.num === current.num - 1) {
      return {
        selfId: ordered[index].id,
        self: makeLabel(left.num, current.suffix),
        partnerId: ordered[index - 1].id,
        partner: makeLabel(current.num, current.suffix),
      };
    }
  }

  if (!left && right && right.suffix === current.suffix && right.num === current.num - 1) {
    if (chainNumberDirection(ordered) !== 'increasing') return null;
    // Endpoint swaps rest on a one-sided direction guess — far weaker evidence
    // than the sandwiched case above. When BOTH cells carry confident original
    // OCR reads, a "reversed" pair at a chain end is almost always the plan's
    // real numbering (snake/serpentine rows, tower top rows), not a double
    // misread. Never flip confident pairs on this heuristic.
    const partnerUnit = ordered[index + 1];
    if (ordered[index].labelConfidence >= 0.8 && partnerUnit.labelConfidence >= 0.8) {
      return null;
    }
    const beyond = linearNeighbors(ordered, index + 1).right;
    if (!beyond || beyond.num > right.num) {
      return {
        selfId: ordered[index].id,
        self: makeLabel(right.num, current.suffix),
        partnerId: partnerUnit.id,
        partner: makeLabel(current.num, current.suffix),
      };
    }
  }

  return null;
}

/**
 * Fill an empty slot from a single labeled neighbor along a chain axis.
 *
 * Only original (OCR/user) labels may anchor a single-side fill — labels that
 * were themselves inferred are excluded via `inferredIds`. Without this,
 * one bad seed cascades down an unlabeled row in a single pass, renumbering
 * an entire physical row of units. Two-sided gap fill stays unrestricted
 * because both anchors must already agree on the count.
 */
function inferSingleSide(
  units: EditableUnit[],
  target: EditableUnit,
  ordered: EditableUnit[],
  index: number,
  neighbors: LinearNeighbors,
  current: ParsedNumericLabel | null,
  sortKey: 'cx' | 'cy',
  inferredIds: ReadonlySet<string>
): ParsedNumericLabel | null {
  if (current) return null;
  const { left, right } = neighbors;
  const { leftIdx, rightIdx } = labeledNeighborIndices(ordered, index);
  const gapToLeft = leftIdx >= 0 ? index - leftIdx - 1 : Infinity;
  const gapToRight = rightIdx >= 0 ? rightIdx - index - 1 : Infinity;

  const candidates: ParsedNumericLabel[] = [];
  if (left && !right && gapToLeft === 0 && !inferredIds.has(ordered[leftIdx].id)) {
    candidates.push(makeLabel(left.num + 1, left.suffix), makeLabel(left.num - 1, left.suffix));
  }
  if (right && !left && gapToRight === 0 && !inferredIds.has(ordered[rightIdx].id)) {
    candidates.push(makeLabel(right.num - 1, right.suffix), makeLabel(right.num + 1, right.suffix));
  }

  let best: ParsedNumericLabel | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.num < 1) continue; // unit numbers are positive — never invent 0/-1
    if (!perpendicularConsistent(units, target, candidate, sortKey)) continue;
    if (!cardinalConsistent(units, target, candidate, sortKey)) continue;
    const score =
      neighborFitScore(ordered, index, candidate) +
      globalNeighborFitScore(units, target, candidate, true);
    if (
      score > bestScore ||
      (score === bestScore &&
        best &&
        preferSingleSideCandidate(candidate, best, sortKey, ordered, index, neighbors) === candidate)
    ) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Should we replace `current` with `inferred` given labeled neighbors?
 * Covers: missing slot, value outside (left, right), transposed digits.
 */
function shouldReplaceWithLinearMiddle(
  current: ParsedNumericLabel | null,
  inferred: ParsedNumericLabel,
  neighbors: LinearNeighbors
): boolean {
  const { left, right } = neighbors;
  if (!left || !right) return false;
  if (left.suffix !== right.suffix) return false;

  const increasing = right.num - left.num === 2;
  const decreasing = left.num - right.num === 2;
  if (!increasing && !decreasing) return false;

  if (!current) return true;
  // A suffixed label ("34A") marks an auxiliary door cell of its base unit —
  // it legitimately repeats the base number and sits between plain-numbered
  // cells, so integer-sequence repair does not apply. Never rewrite it.
  if (current.suffix) return false;
  if (current.num === inferred.num && current.suffix === inferred.suffix) return false;

  if (increasing) {
    if (current.num <= left.num || current.num >= right.num) return true;
  } else {
    if (current.num >= left.num || current.num <= right.num) return true;
  }

  if (isDigitTransposition(current.num, inferred.num)) return true;

  return false;
}

/**
 * OCR often transposes digits on the next sequential unit (13↔31 when left is 30).
 */
function inferTranspositionFix(
  neighbors: LinearNeighbors,
  current: ParsedNumericLabel | null
): ParsedNumericLabel | null {
  if (!current || !neighbors.left) return null;
  if (current.suffix !== neighbors.left.suffix) return null;
  const expected = neighbors.left.num + 1;
  if (!isDigitTransposition(current.num, expected)) return null;
  if (neighbors.right && expected >= neighbors.right.num) return null;
  return makeLabel(expected, current.suffix);
}

/** Corner fills for grid/snake layouts (multiple diagonal patterns). */
function inferCornerFill(
  leftUnit: EditableUnit | null,
  aboveUnit: EditableUnit | null,
  rightUnit: EditableUnit | null,
  belowUnit: EditableUnit | null
): ParsedNumericLabel | null {
  const left = leftUnit ? parseNumericLabel(leftUnit.label) : null;
  const above = aboveUnit ? parseNumericLabel(aboveUnit.label) : null;
  const right = rightUnit ? parseNumericLabel(rightUnit.label) : null;
  const below = belowUnit ? parseNumericLabel(belowUnit.label) : null;

  if (left && above && left.suffix === above.suffix && above.num - left.num === 2) {
    return makeLabel(left.num + 1, left.suffix);
  }
  if (
    left &&
    below &&
    leftUnit &&
    belowUnit &&
    left.suffix === below.suffix &&
    below.num - left.num === 2 &&
    !isHorizontalNeighbor(leftUnit, belowUnit)
  ) {
    return makeLabel(left.num + 1, left.suffix);
  }
  if (
    right &&
    above &&
    rightUnit &&
    aboveUnit &&
    right.suffix === above.suffix &&
    above.num - right.num === 2 &&
    !isHorizontalNeighbor(rightUnit, aboveUnit)
  ) {
    return makeLabel(right.num + 1, right.suffix);
  }
  if (
    right &&
    below &&
    rightUnit &&
    belowUnit &&
    right.suffix === below.suffix &&
    below.num - right.num === 2 &&
    !isHorizontalNeighbor(rightUnit, belowUnit)
  ) {
    return makeLabel(right.num + 1, right.suffix);
  }
  return null;
}

function shouldReplaceWithCorner(
  units: EditableUnit[],
  target: EditableUnit,
  current: ParsedNumericLabel | null,
  inferred: ParsedNumericLabel,
  leftUnit: EditableUnit | null,
  aboveUnit: EditableUnit | null,
  rightUnit: EditableUnit | null,
  belowUnit: EditableUnit | null,
  maxDist: number
): boolean {
  const left = leftUnit ? parseNumericLabel(leftUnit.label) : null;
  const above = aboveUnit ? parseNumericLabel(aboveUnit.label) : null;
  const right = rightUnit ? parseNumericLabel(rightUnit.label) : null;
  const below = belowUnit ? parseNumericLabel(belowUnit.label) : null;

  const patterns: [ParsedNumericLabel | null, ParsedNumericLabel | null][] = [
    [left, above],
    [left, below],
    [right, above],
    [right, below],
  ];

  let matches = false;
  for (const [a, b] of patterns) {
    if (!a || !b || a.suffix !== b.suffix) continue;
    if (Math.abs(b.num - a.num) === 2 && a.num + 1 === inferred.num) {
      matches = true;
      break;
    }
  }
  if (!matches) return false;

  if (!current) return true;
  // Suffixed labels are auxiliary door cells (see shouldReplaceWithLinearMiddle)
  // — corner sequence repair does not apply to them.
  if (current.suffix) return false;
  if (current.num === inferred.num && current.suffix === inferred.suffix) return false;

  const cardinals = findCardinalNeighbors(units, target, maxDist);
  for (const u of [cardinals.left, cardinals.right, cardinals.above, cardinals.below]) {
    if (!u) continue;
    const p = parseNumericLabel(u.label);
    if (p && p.suffix === current.suffix && Math.abs(p.num - current.num) === 1) {
      return false;
    }
  }

  if (isDigitTransposition(current.num, inferred.num)) return true;

  const lo = inferred.num - 1;
  const hi = inferred.num + 1;
  if (current.num < lo || current.num > hi) return true;

  return false;
}

interface CardinalNeighbors {
  left: EditableUnit | null;
  right: EditableUnit | null;
  above: EditableUnit | null;
  below: EditableUnit | null;
}

/** Nearest labeled unit in each cardinal direction (image y-down). */
function findCardinalNeighbors(
  units: EditableUnit[],
  target: EditableUnit,
  maxDist: number,
  relaxedVertical = false
): CardinalNeighbors {
  let left: EditableUnit | null = null;
  let right: EditableUnit | null = null;
  let above: EditableUnit | null = null;
  let below: EditableUnit | null = null;
  const isVertical = relaxedVertical ? isVerticalNeighborRelaxed : isVerticalNeighbor;

  for (const u of units) {
    if (u.id === target.id) continue;
    if (!parseNumericLabel(u.label)) continue;

    const dx = u.bounds.cx - target.bounds.cx;
    const dy = u.bounds.cy - target.bounds.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) continue;

    if (isHorizontalNeighbor(target, u) && dx < 0 && (!left || u.bounds.cx > left.bounds.cx)) {
      left = u;
    }
    if (isHorizontalNeighbor(target, u) && dx > 0 && (!right || u.bounds.cx < right.bounds.cx)) {
      right = u;
    }
    if (isVertical(target, u) && dy < 0 && (!above || u.bounds.cy > above.bounds.cy)) {
      above = u;
    }
    if (isVertical(target, u) && dy > 0 && (!below || u.bounds.cy < below.bounds.cy)) {
      below = u;
    }
  }

  return { left, right, above, below };
}

function neighborSearchRadius(units: EditableUnit[]): number {
  const medW = median(units.map((u) => u.bounds.width));
  const medH = median(units.map((u) => u.bounds.height));
  return Math.max(medW, medH) * 2.5;
}

/** Reject a candidate if a perpendicular neighbor conflicts (ignores cross-column rows). */
function cardinalConsistent(
  units: EditableUnit[],
  target: EditableUnit,
  candidate: ParsedNumericLabel,
  sortKey: 'cx' | 'cy'
): boolean {
  const cardinals = findCardinalNeighbors(units, target, neighborSearchRadius(units));
  const checks =
    sortKey === 'cx'
      ? [cardinals.above, cardinals.below]
      : [cardinals.left, cardinals.right];

  for (const u of checks) {
    if (!u) continue;
    const p = parseNumericLabel(u.label);
    if (!p || p.suffix !== candidate.suffix) continue;
    if (Math.abs(p.num - candidate.num) === 0) return false;
    if (Math.abs(p.num - candidate.num) > 1) continue;
  }
  return true;
}

/** Score how well `label` fits adjacent labeled units in any cardinal direction. */
function globalNeighborFitScore(
  units: EditableUnit[],
  target: EditableUnit,
  label: ParsedNumericLabel,
  relaxedVertical = false
): number {
  const medW = median(units.map((u) => u.bounds.width));
  const medH = median(units.map((u) => u.bounds.height));
  const cardinals = findCardinalNeighbors(
    units,
    target,
    Math.max(medW, medH) * 2.5,
    relaxedVertical
  );
  let score = 0;
  for (const u of [cardinals.left, cardinals.right, cardinals.above, cardinals.below]) {
    if (!u) continue;
    const p = parseNumericLabel(u.label);
    if (!p || p.suffix !== label.suffix) continue;
    if (Math.abs(p.num - label.num) === 1) score += 2;
  }
  return score;
}

/** Score how well `label` fits between immediate labeled neighbors in a line. */
function neighborFitScore(
  sorted: EditableUnit[],
  index: number,
  label: ParsedNumericLabel
): number {
  const { left, right } = linearNeighbors(sorted, index);
  let score = 0;
  if (left && Math.abs(label.num - left.num) === 1) score += 2;
  if (right && Math.abs(label.num - right.num) === 1) score += 2;
  if (left && right && label.num > Math.min(left.num, right.num) && label.num < Math.max(left.num, right.num)) {
    score += 1;
  }
  return score;
}

function applyLabel(units: EditableUnit[], id: string, text: string): EditableUnit[] {
  return units.map((u) =>
    u.id === id
      ? {
          ...u,
          label: text,
          kind: 'unit',
          labelConfidence: Math.max(u.labelConfidence, 0.55),
        }
      : u
  );
}

function clearLabel(units: EditableUnit[], id: string): EditableUnit[] {
  return units.map((u) =>
    u.id === id ? { ...u, label: undefined, kind: 'unit' as const, labelConfidence: 0 } : u
  );
}

/** Fix missing/wrong labels along a 1D sequence (row or column). */
function processLinearGroup(
  units: EditableUnit[],
  sorted: EditableUnit[],
  sortKey: 'cx' | 'cy',
  inferredIds: Set<string>
): { units: EditableUnit[]; changed: boolean } {
  let current = units;
  let changed = false;
  const ordered = [...sorted].sort((a, b) => a.bounds[sortKey] - b.bounds[sortKey]);

  for (let i = 0; i < ordered.length; i++) {
    const u = ordered[i];
    const neighbors = linearNeighbors(ordered, i);
    const currentLabel = parseNumericLabel(u.label);

    const inferred = inferLinearMiddle(neighbors);
    if (inferred && shouldReplaceWithLinearMiddle(currentLabel, inferred, neighbors)) {
      current = applyLabel(current, u.id, inferred.text);
      ordered[i] = { ...u, label: inferred.text };
      inferredIds.add(u.id);
      changed = true;
      continue;
    }

    const swap = inferAdjacentSwap(ordered, i, neighbors);
    if (swap) {
      current = applyLabel(current, swap.selfId, swap.self.text);
      current = applyLabel(current, swap.partnerId, swap.partner.text);
      ordered[i] = { ...ordered[i], label: swap.self.text };
      const partnerIdx = ordered.findIndex((x) => x.id === swap.partnerId);
      if (partnerIdx >= 0) ordered[partnerIdx] = { ...ordered[partnerIdx], label: swap.partner.text };
      changed = true;
      continue;
    }

    if (!currentLabel) {
      const { leftIdx, rightIdx } = labeledNeighborIndices(ordered, i);
      if (leftIdx >= 0 && rightIdx >= 0) {
        const gapFill = inferLinearGapFill(ordered, leftIdx, rightIdx);
        const gapLabel = gapFill?.get(u.id);
        if (
          gapLabel &&
          perpendicularConsistent(current, u, gapLabel, sortKey) &&
          cardinalConsistent(current, u, gapLabel, sortKey)
        ) {
          current = applyLabel(current, u.id, gapLabel.text);
          ordered[i] = { ...u, label: gapLabel.text };
          inferredIds.add(u.id);
          changed = true;
          continue;
        }
      }
    }

    const single = inferSingleSide(current, u, ordered, i, neighbors, currentLabel, sortKey, inferredIds);
    if (single) {
      current = applyLabel(current, u.id, single.text);
      ordered[i] = { ...u, label: single.text };
      inferredIds.add(u.id);
      changed = true;
      continue;
    }

    const transposed = inferTranspositionFix(neighbors, currentLabel);
    if (transposed && currentLabel && transposed.num !== currentLabel.num) {
      current = applyLabel(current, u.id, transposed.text);
      ordered[i] = { ...u, label: transposed.text };
      changed = true;
    }
  }

  return { units: current, changed };
}

/** Clear duplicate labels globally — keep the unit that best fits its neighbors. */
function resolveDuplicatesGlobal(units: EditableUnit[]): {
  units: EditableUnit[];
  changed: boolean;
} {
  let current = units;
  let changed = false;
  const byKey = new Map<string, EditableUnit[]>();

  for (const u of current) {
    const p = parseNumericLabel(u.label);
    if (!p) continue;
    const key = `${p.num}:${p.suffix}`;
    const arr = byKey.get(key);
    if (arr) arr.push(u);
    else byKey.set(key, [u]);
  }

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const scored = group.map((u) => ({
      u,
      score: globalNeighborFitScore(current, u, parseNumericLabel(u.label)!),
      conf: u.labelConfidence,
    }));
    scored.sort((a, b) => b.score - a.score || b.conf - a.conf);
    for (let k = 1; k < scored.length; k++) {
      current = clearLabel(current, scored[k].u.id);
      changed = true;
    }
  }

  return { units: current, changed };
}

/** Fix corner cells using left + above neighbors (e.g. 48 + 50 → 49). */
function processCorners(units: EditableUnit[]): { units: EditableUnit[]; changed: boolean } {
  if (units.length < 3) return { units, changed: false };

  const maxDist = neighborSearchRadius(units);

  let current = units;
  let changed = false;

  for (const u of units) {
    const { left, right, above, below } = findCardinalNeighbors(current, u, maxDist, true);
    const inferred = inferCornerFill(left, above, right, below);
    if (!inferred) continue;

    const currentLabel = parseNumericLabel(u.label);
    if (
      shouldReplaceWithCorner(
        current,
        u,
        currentLabel,
        inferred,
        left,
        above,
        right,
        below,
        maxDist
      )
    ) {
      current = applyLabel(current, u.id, inferred.text);
      changed = true;
    }
  }

  return { units: current, changed };
}

/**
 * Run up to `maxPasses` of neighbor-based label inference on a unit list.
 * Returns a new array (does not mutate inputs).
 */
export function resolveLabelsFromNeighbors(
  units: EditableUnit[],
  maxPasses = 3
): EditableUnit[] {
  let current = units.map((u) => ({ ...u }));

  const inferredIds = new Set<string>();
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    const { rows, cols } = discoverSpatialChains(current);

    for (const row of rows) {
      const result = processLinearGroup(current, row, 'cx', inferredIds);
      current = result.units;
      if (result.changed) changed = true;
    }

    for (const col of cols) {
      const result = processLinearGroup(current, col, 'cy', inferredIds);
      current = result.units;
      if (result.changed) changed = true;
    }

    const cornerResult = processCorners(current);
    current = cornerResult.units;
    if (cornerResult.changed) changed = true;

    const dupResult = resolveDuplicatesGlobal(current);
    current = dupResult.units;
    if (dupResult.changed) changed = true;

    if (!changed) break;
  }

  return current;
}

/** Axis-aligned edge gap between two (possibly rotated) units; ≤0 means touching/overlap. */
function edgeGap(a: EditableUnit, b: EditableUnit): number {
  const ba = aabb(a.bounds, a.rotationRad);
  const bb = aabb(b.bounds, b.rotationRad);
  const dx = Math.max(ba.x, bb.x) - Math.min(ba.x + ba.width, bb.x + bb.width);
  const dy = Math.max(ba.y, bb.y) - Math.min(ba.y + ba.height, bb.y + bb.height);
  return Math.max(dx, dy);
}

/**
 * A borderline-fill box is rescued when it's clearly part of the unit fabric:
 * it abuts a confidently-kept unit and is about the same size. Real cells in a
 * scan sometimes come back with low fill (hatching, text over the cell), but
 * they always share a wall with neighbors — whereas bollards/symbols float in
 * the aisle and are far smaller than any adjacent unit.
 */
function isRescuableNeighbor(candidate: EditableUnit, kept: EditableUnit[]): boolean {
  if (candidate.detectionConfidence < 0.7) return false;
  const area = unitArea(candidate);
  for (const k of kept) {
    if (edgeGap(candidate, k) > 2) continue;
    const ratio = area / Math.max(1, unitArea(k));
    if (ratio >= 0.5 && ratio <= 2) return true;
  }
  return false;
}

/**
 * Frontend mirror of backend ingest filters (same thresholds).
 * Keeps unlabeled boxes for review; drops non-rectangular and tiny outlier shapes.
 */
export function filterUnitsForIngest(units: EditableUnit[]): EditableUnit[] {
  const kept: EditableUnit[] = [];
  const borderline: EditableUnit[] = [];

  for (const u of units) {
    const { width, height } = u.bounds;
    const fill = u.detectionConfidence;
    const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
    // A confidently-read unit number is strong evidence of a real cell — don't
    // let borderline fill/aspect heuristics drop it.
    const confidentLabel = !!u.label && u.labelConfidence >= 0.8;
    const failsFill = fill < 0.82 && !confidentLabel;
    const failsAspect = aspect < 1.25 && fill < 0.85 && !confidentLabel;
    if (failsFill || failsAspect) {
      borderline.push(u);
    } else {
      kept.push(u);
    }
  }

  let working = [...kept, ...borderline.filter((u) => isRescuableNeighbor(u, kept))];

  if (working.length >= 3) {
    const areas = working.map(unitArea).sort((a, b) => a - b);
    const med = areas[Math.floor(areas.length / 2)];
    const minArea = med * 0.25;
    working = working.filter((u) => unitArea(u) >= minArea);
  }

  return working.map((u) => ({ ...u, kind: 'unit' as const }));
}
