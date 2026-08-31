/**
 * Deterministic woodland water bodies (a meandering river + a pond).
 *
 * This module is the single source of truth for water placement so the three
 * consumers stay in sync:
 *  - {@link woodlandTerrain} carves the riverbed/pond bowl into the JS terrain
 *    height (used for tree/scenery Y placement),
 *  - `GroundPlaneManager` mirrors the same carve in its GLSL hills shader, and
 *  - `SceneryManager` builds the animated water surface meshes.
 *
 * All coordinates are world-space. The layout is derived purely from the
 * woodland layout metrics + environment seed, so every consumer that calls
 * {@link computeWoodlandWaterLayout} with the same inputs gets identical water.
 */

import { createSeededRandom, hashStringToSeed } from './deterministicRandom';
import { woodlandHillClearingHalf } from './woodlandTerrain';

/** Fixed-size river control polyline (kept in lock-step with the GLSL uniform array). */
export const WOODLAND_RIVER_POINT_COUNT = 12;
/** Hard caps so the GLSL shader can use fixed-size uniform arrays. */
export const WOODLAND_MAX_RIVERS = 3;
export const WOODLAND_MAX_PONDS = 4;

export interface WoodlandWaterMetrics {
  centerX: number;
  centerZ: number;
  padHalfX: number;
  padHalfZ: number;
  facilityHalfX: number;
  facilityHalfZ: number;
  fadeStart: number;
  outerFade?: number;
}

export interface WoodlandWaterPoint {
  x: number;
  z: number;
}

export interface WoodlandRiverLayout {
  points: WoodlandWaterPoint[];
  /** Nominal half-width (used for clearance maths). */
  halfWidth: number;
  /** Per-control-point half-width so the channel pinches and widens naturally. */
  halfWidths: number[];
}

export interface WoodlandPondLayout {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}

export interface WoodlandWaterLayout {
  enabled: boolean;
  /** Still-water surface elevation (world Y). */
  waterLevelY: number;
  /** Vertical drop from the waterline to the channel/pond floor. */
  bedDepth: number;
  /** Horizontal distance over which carved banks blend back to natural terrain. */
  bankWidth: number;
  /** Pre-computed bed slope (depth per metre) for the submerged bowl. */
  underSlope: number;
  rivers: WoodlandRiverLayout[];
  ponds: WoodlandPondLayout[];
  /** Radial fade band (matches the ground plane) so far water disappears with the land. */
  centerX: number;
  centerZ: number;
  fadeStart: number;
  fadeEnd: number;
}

export interface WoodlandWaterOptions {
  enabled?: boolean;
  /** Number of rivers to generate (clamped to {@link WOODLAND_MAX_RIVERS}). */
  riverCount?: number;
  /** Number of ponds to generate (clamped to {@link WOODLAND_MAX_PONDS}). */
  pondCount?: number;
  /** Multiplier on river width. */
  riverWidthScale?: number;
  /** Multiplier on pond size. */
  pondScale?: number;
  /** Multiplier on the carved water depth. */
  depthScale?: number;
  /** Multiplier on how much the rivers meander (0 = straight). */
  meanderScale?: number;
}

/** Source shape (woodland env options) for {@link waterOptionsFrom}. */
export interface WoodlandWaterOptionSource {
  riverCount?: number;
  pondCount?: number;
  riverWidth?: number;
  pondSize?: number;
  waterDepth?: number;
  riverMeander?: number;
}

/** Maps persisted woodland env fields onto the internal water-layout options. */
export function waterOptionsFrom(src: WoodlandWaterOptionSource | undefined): WoodlandWaterOptions {
  if (!src) return {};
  return {
    riverCount: src.riverCount,
    pondCount: src.pondCount,
    riverWidthScale: src.riverWidth,
    pondScale: src.pondSize,
    depthScale: src.waterDepth,
    meanderScale: src.riverMeander,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.round(clamp(value, min, max));
}

function outerRadiusFor(metrics: WoodlandWaterMetrics): number {
  return metrics.outerFade ? metrics.outerFade * 0.9 : metrics.fadeStart * 1.55;
}

/**
 * Builds the deterministic river + pond layout. Returns a disabled layout when
 * the woodland field is too small to host believable water.
 */
export function computeWoodlandWaterLayout(
  metrics: WoodlandWaterMetrics,
  environmentSeed: string,
  options?: WoodlandWaterOptions
): WoodlandWaterLayout {
  const outerRadius = outerRadiusFor(metrics);
  const clearing = woodlandHillClearingHalf(metrics.padHalfX, metrics.padHalfZ);
  // Circumradius of the rectangular flat clearing — keeps water clear of its corners.
  const clearingRadius = Math.hypot(clearing.x, clearing.z);

  const depthScale = clamp(options?.depthScale ?? 1, 0.3, 3);
  const waterLevelY = -0.6;
  const bedDepth = 3.2 * depthScale;
  const bankWidth = clamp(outerRadius * 0.05, 7, 26);
  const underSlope = bedDepth / Math.max(bankWidth * 0.55, 1);

  const baseLayout: WoodlandWaterLayout = {
    enabled: false,
    waterLevelY,
    bedDepth,
    bankWidth,
    underSlope,
    rivers: [],
    ponds: [],
    centerX: metrics.centerX,
    centerZ: metrics.centerZ,
    fadeStart: metrics.fadeStart,
    fadeEnd: metrics.outerFade ?? metrics.fadeStart * 1.55,
  };

  if (options?.enabled === false) return baseLayout;

  // Need enough grass beyond the flat clearing to fit a river corridor + banks.
  const usableOuter = outerRadius * 0.86;
  if (usableOuter <= clearingRadius + bankWidth * 2 + 12) {
    return baseLayout;
  }

  const rng = createSeededRandom(hashStringToSeed(`${environmentSeed}:woodland-water`));

  const riverCount = clampInt(options?.riverCount, 0, WOODLAND_MAX_RIVERS, 1);
  const pondCount = clampInt(options?.pondCount, 0, WOODLAND_MAX_PONDS, 1);
  const widthScale = clamp(options?.riverWidthScale ?? 1, 0.2, 4);
  const pondSizeScale = clamp(options?.pondScale ?? 1, 0.2, 4);
  const meanderScale = clamp(options?.meanderScale ?? 1, 0, 3);

  const ctx: RiverBuildContext = {
    metrics,
    outerRadius,
    usableOuter,
    clearingRadius,
    bankWidth,
    widthScale,
    meanderScale,
  };

  const rivers: WoodlandRiverLayout[] = [];
  for (let r = 0; r < riverCount; r++) {
    const river = buildRiver(rng, r, ctx);
    if (river) rivers.push(river);
  }

  const ponds: WoodlandPondLayout[] = [];
  for (let p = 0; p < pondCount; p++) {
    const pond = buildPond(rng, p, pondCount, ctx, pondSizeScale, rivers);
    if (pond) ponds.push(pond);
  }

  return {
    ...baseLayout,
    enabled: rivers.length > 0 || ponds.length > 0,
    rivers,
    ponds,
  };
}

interface RiverBuildContext {
  metrics: WoodlandWaterMetrics;
  outerRadius: number;
  usableOuter: number;
  clearingRadius: number;
  bankWidth: number;
  widthScale: number;
  meanderScale: number;
}

/** Builds one meandering, variable-width river corridor across the field. */
function buildRiver(
  rng: () => number,
  index: number,
  ctx: RiverBuildContext
): WoodlandRiverLayout | null {
  const { metrics, outerRadius, usableOuter, clearingRadius, bankWidth } = ctx;

  const riverHalfWidth =
    clamp(outerRadius * 0.028, 4, 22) * ctx.widthScale * (0.85 + rng() * 0.3);

  // Each river travels along its own seeded heading, offset to one side. Rivers
  // alternate sides by index so multiple channels spread across the field.
  const heading = rng() * Math.PI * 2;
  const dir = { x: Math.cos(heading), z: Math.sin(heading) };
  const perp = { x: -dir.z, z: dir.x };

  const meanderAmp = clamp(outerRadius * 0.12, 10, 130) * ctx.meanderScale;
  const meanderFreq = (1.4 + rng() * 1.2) / Math.max(outerRadius, 1);
  // Three meander octaves (normalised) so the path wanders instead of tracing a
  // single clean sine. The higher octaves add the small kinks real rivers have.
  const oct2Freq = meanderFreq * (2.3 + rng() * 0.9);
  const oct3Freq = meanderFreq * (4.8 + rng() * 1.4);
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const phase3 = rng() * Math.PI * 2;
  const octaveNorm = 1 / (1 + 0.42 + 0.18);

  const minOffset = clearingRadius + bankWidth + riverHalfWidth + meanderAmp + 14;
  const maxOffset = usableOuter - bankWidth - riverHalfWidth;
  if (maxOffset <= clearingRadius + bankWidth + riverHalfWidth) return null;
  const offsetSign = index % 2 === 0 ? 1 : -1;
  const offset =
    maxOffset > minOffset
      ? offsetSign * (minOffset + rng() * (maxOffset - minOffset))
      : offsetSign * Math.min(minOffset, maxOffset);

  // Variable width: the channel pinches and widens along its run.
  const widthPhase1 = rng() * Math.PI * 2;
  const widthPhase2 = rng() * Math.PI * 2;
  const widthFreq1 = 0.7 + rng() * 0.7;
  const widthFreq2 = 1.9 + rng() * 1.1;

  const span = usableOuter;
  const points: WoodlandWaterPoint[] = [];
  const halfWidths: number[] = [];
  for (let i = 0; i < WOODLAND_RIVER_POINT_COUNT; i++) {
    const t = (i / (WOODLAND_RIVER_POINT_COUNT - 1)) * 2 - 1; // -1..1
    const along = t * span;
    const meander =
      meanderAmp *
      octaveNorm *
      (Math.sin(along * meanderFreq + phase1) +
        0.42 * Math.sin(along * oct2Freq + phase2) +
        0.18 * Math.sin(along * oct3Freq + phase3));
    const lateral = offset + meander;
    points.push({
      x: metrics.centerX + dir.x * along + perp.x * lateral,
      z: metrics.centerZ + dir.z * along + perp.z * lateral,
    });

    const widthFactor = clamp(
      0.82 +
        0.24 * Math.sin(i * widthFreq1 + widthPhase1) +
        0.12 * Math.sin(i * widthFreq2 + widthPhase2),
      0.45,
      1.2
    );
    halfWidths.push(riverHalfWidth * widthFactor);
  }

  return { points, halfWidth: riverHalfWidth, halfWidths };
}

/** Places one pond nestled in the hills, clear of the clearing and the rivers. */
function buildPond(
  rng: () => number,
  index: number,
  pondCount: number,
  ctx: RiverBuildContext,
  pondSizeScale: number,
  rivers: WoodlandRiverLayout[]
): WoodlandPondLayout | null {
  const { metrics, outerRadius, usableOuter, clearingRadius, bankWidth } = ctx;
  const pondRadiusBase = clamp(outerRadius * 0.085, 12, 70) * pondSizeScale;
  const minDist = clearingRadius + pondRadiusBase + bankWidth + 12;
  const maxDist = usableOuter - pondRadiusBase - bankWidth;
  if (maxDist <= minDist) return null;

  // Spread ponds around the facility, then nudge off any river they land on.
  const sector = (Math.PI * 2) / Math.max(pondCount, 1);
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = index * sector + (rng() - 0.5) * sector + rng() * 0.4;
    const dist = minDist + rng() * (maxDist - minDist);
    const cx = metrics.centerX + Math.cos(angle) * dist;
    const cz = metrics.centerZ + Math.sin(angle) * dist;
    const rx = pondRadiusBase * (0.85 + rng() * 0.4);
    const rz = pondRadiusBase * (0.7 + rng() * 0.4);

    let clearOfRivers = true;
    for (const river of rivers) {
      if (riverSignedDistanceTo(cx, cz, river) < Math.max(rx, rz) + bankWidth + 6) {
        clearOfRivers = false;
        break;
      }
    }
    if (clearOfRivers) return { cx, cz, rx, rz };
  }
  return null;
}

/** Signed distance to a variable-width segment (negative inside the channel). */
function segmentSignedDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  wa: number,
  wb: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq > 0 ? clamp((apx * abx + apz * abz) / lenSq, 0, 1) : 0;
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dist = Math.hypot(px - cx, pz - cz);
  return dist - (wa + (wb - wa) * t);
}

/** Signed distance to a single river's surface (negative inside the channel). */
function riverSignedDistanceTo(x: number, z: number, river: WoodlandRiverLayout): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < river.points.length - 1; i++) {
    const a = river.points[i];
    const b = river.points[i + 1];
    const d = segmentSignedDistance(
      x,
      z,
      a.x,
      a.z,
      b.x,
      b.z,
      river.halfWidths[i],
      river.halfWidths[i + 1]
    );
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance to a single pond's surface (negative inside, world units). */
function pondSignedDistanceTo(x: number, z: number, pond: WoodlandPondLayout): number {
  const nx = (x - pond.cx) / pond.rx;
  const nz = (z - pond.cz) / pond.rz;
  const r = Math.hypot(nx, nz);
  return (r - 1) * Math.min(pond.rx, pond.rz);
}

/**
 * Signed distance to the nearest water surface (any river or pond). Negative
 * inside the water, 0 at the shoreline, positive on land.
 */
export function woodlandWaterSignedDistance(
  x: number,
  z: number,
  layout: WoodlandWaterLayout
): number {
  if (!layout.enabled) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const river of layout.rivers) {
    const d = riverSignedDistanceTo(x, z, river);
    if (d < best) best = d;
  }
  for (const pond of layout.ponds) {
    const d = pondSignedDistanceTo(x, z, pond);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Applies the riverbed/pond carve to a natural terrain height. Inside the water
 * the ground descends into a bowl; on the banks it blends back to the natural
 * (hilly) terrain over {@link WoodlandWaterLayout.bankWidth}.
 */
export function carveWoodlandWaterHeight(
  naturalHeight: number,
  signedDistance: number,
  layout: WoodlandWaterLayout
): number {
  if (!layout.enabled || signedDistance >= layout.bankWidth) return naturalHeight;

  if (signedDistance <= 0) {
    const depth = Math.min(layout.bedDepth, -signedDistance * layout.underSlope);
    return layout.waterLevelY - depth;
  }

  const t = layout.bankWidth > 0 ? signedDistance / layout.bankWidth : 1;
  const smooth = t * t * (3 - 2 * t);
  return layout.waterLevelY + (naturalHeight - layout.waterLevelY) * smooth;
}
