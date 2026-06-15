import { createSeededRandom, hashStringToSeed } from './deterministicRandom';
import {
  sampleWoodlandDensity,
  sampleWoodlandTerrainHeight,
  WOODLAND_HILL_AMPLITUDE,
} from './woodlandTerrain';
import {
  computeWoodlandWaterLayout,
  waterOptionsFrom,
  woodlandWaterSignedDistance,
  type WoodlandWaterLayout,
} from './woodlandWater';

/** Keep trees on dry land; shrubs may creep a little closer to the shoreline. */
const TREE_WATER_CLEARANCE = 3;
const SHRUB_WATER_CLEARANCE = 1;

/** Canadian-style procedural trees (no palms or tropical species). */
export const CANADIAN_WOODLAND_TREE_IDS = [
  'tree-oak',
  'tree-oak-small',
  'tree-pine',
  'tree-pine-large',
] as const;

export type CanadianWoodlandTreeId = (typeof CANADIAN_WOODLAND_TREE_IDS)[number];

export type WoodlandSceneryAssetId = CanadianWoodlandTreeId | 'shrub-round';

export interface WoodlandTreePlacement {
  x: number;
  z: number;
  y: number;
  assetId: WoodlandSceneryAssetId;
  scale: number;
  rotationY: number;
}

export interface WoodlandTreePlacementInput {
  centerX: number;
  centerZ: number;
  padHalfX: number;
  padHalfZ: number;
  fadeStart: number;
  outerFade?: number;
  facilityHalfX: number;
  facilityHalfZ: number;
  environmentSeed: string;
  treeDensity?: number;
  treeScaleMin?: number;
  treeScaleMax?: number;
  landmarkTreeChance?: number;
  pineMix?: number;
  hillAmplitude?: number;
  hillScale?: number;
  riverCount?: number;
  pondCount?: number;
  riverWidth?: number;
  pondSize?: number;
  waterDepth?: number;
  riverMeander?: number;
}

/** Occasional landmark trees; most of the forest stays modest in scale. */
const TREE_SCALE_MIN = 0.55;
const TREE_SCALE_MAX = 3.75;
const TREE_SCALE_LANDMARK_CHANCE = 0.045;
const TREE_SCALE_LANDMARK_MAX = 6.25;

const TREE_WEIGHTS: Array<{ id: CanadianWoodlandTreeId; weight: number }> = [
  { id: 'tree-pine-large', weight: 0.28 },
  { id: 'tree-oak', weight: 0.27 },
  { id: 'tree-pine', weight: 0.27 },
  { id: 'tree-oak-small', weight: 0.18 },
];

/** Bias toward smaller/medium trees; rare roll reaches landmark scale. */
function sampleTreeScale(rng: () => number, input: WoodlandTreePlacementInput): number {
  const landmarkChance = input.landmarkTreeChance ?? TREE_SCALE_LANDMARK_CHANCE;
  const scaleMin = input.treeScaleMin ?? TREE_SCALE_MIN;
  const scaleMax = input.treeScaleMax ?? TREE_SCALE_MAX;
  if (rng() < landmarkChance) {
    return scaleMax + rng() * (TREE_SCALE_LANDMARK_MAX - scaleMax);
  }
  const t = Math.pow(rng(), 1.75);
  return scaleMin + t * (scaleMax - scaleMin);
}

function pickTreeAsset(
  rng: () => number,
  preferPine: boolean,
  pineMix = 0.5
): CanadianWoodlandTreeId {
  const pineBias = 0.5 + (pineMix - 0.5) * 1.8;
  const weights = preferPine
    ? TREE_WEIGHTS.map((w) =>
        w.id.includes('pine')
          ? { ...w, weight: w.weight * (1 + pineBias) }
          : { ...w, weight: w.weight * (1.5 - pineBias) }
      )
    : TREE_WEIGHTS;
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let roll = rng() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return 'tree-oak';
}

function isInGrassZone(
  relX: number,
  relZ: number,
  input: WoodlandTreePlacementInput,
  outerRadius: number,
  padMargin: number,
  buildingMargin: number
): boolean {
  const { padHalfX, padHalfZ, facilityHalfX, facilityHalfZ } = input;
  if (Math.abs(relX) <= padHalfX + padMargin && Math.abs(relZ) <= padHalfZ + padMargin) {
    return false;
  }
  if (
    Math.abs(relX) <= facilityHalfX + buildingMargin &&
    Math.abs(relZ) <= facilityHalfZ + buildingMargin
  ) {
    return false;
  }
  return Math.hypot(relX, relZ) <= outerRadius;
}

function minSpacingOk(
  placements: WoodlandTreePlacement[],
  x: number,
  z: number,
  minDist: number
): boolean {
  const minDistSq = minDist * minDist;
  for (const p of placements) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < minDistSq) return false;
  }
  return true;
}

function radialDistanceFromCenter(
  input: WoodlandTreePlacementInput,
  x: number,
  z: number
): number {
  return Math.hypot(x - input.centerX, z - input.centerZ);
}

function woodlandDistanceWeight(
  input: WoodlandTreePlacementInput,
  x: number,
  z: number,
  outerRadius: number
): number {
  const radial = radialDistanceFromCenter(input, x, z);
  const padRadius = Math.max(input.padHalfX, input.padHalfZ);
  const facilityRadius = Math.max(input.facilityHalfX, input.facilityHalfZ);
  const innerBuffer = Math.max(padRadius + 8, facilityRadius + 10);
  const innerClear = innerBuffer + Math.max(16, (outerRadius - innerBuffer) * 0.18);
  const midForest = innerClear + (outerRadius - innerClear) * 0.35;

  if (radial <= innerBuffer) return 0.16;
  if (radial <= innerClear) {
    const t = (radial - innerBuffer) / Math.max(innerClear - innerBuffer, 1);
    return 0.2 + t * 0.28;
  }
  if (radial <= midForest) {
    const t = (radial - innerClear) / Math.max(midForest - innerClear, 1);
    return 0.46 + t * 0.18;
  }

  const outerT = (radial - midForest) / Math.max(outerRadius - midForest, 1);
  return 0.56 + Math.sin(outerT * Math.PI) * 0.14 + outerT * 0.08;
}

/** Far enough from any water surface to stand on dry ground. */
function isAwayFromWater(
  x: number,
  z: number,
  waterLayout: WoodlandWaterLayout | undefined,
  clearance: number
): boolean {
  if (!waterLayout?.enabled) return true;
  return woodlandWaterSignedDistance(x, z, waterLayout) >= clearance;
}

function pushPlacement(
  placements: WoodlandTreePlacement[],
  input: WoodlandTreePlacementInput,
  x: number,
  z: number,
  assetId: WoodlandSceneryAssetId,
  scale: number,
  rotationY: number,
  waterLayout?: WoodlandWaterLayout
): void {
  placements.push({
    x,
    z,
    y: sampleWoodlandTerrainHeight(
      x,
      z,
      input.centerX,
      input.centerZ,
      input.padHalfX,
      input.padHalfZ,
      input.environmentSeed,
      input.hillAmplitude ?? WOODLAND_HILL_AMPLITUDE,
      waterLayout
    ),
    assetId,
    scale,
    rotationY,
  });
}

function tryPlaceTree(
  placements: WoodlandTreePlacement[],
  input: WoodlandTreePlacementInput,
  rng: () => number,
  x: number,
  z: number,
  outerRadius: number,
  minSpacing: number,
  preferPine: boolean,
  waterLayout?: WoodlandWaterLayout,
  options?: { densityBoost?: number; skipDensityRoll?: boolean }
): boolean {
  if (!isAwayFromWater(x, z, waterLayout, TREE_WATER_CLEARANCE)) return false;

  const radial = radialDistanceFromCenter(input, x, z);
  const padRadius = Math.max(input.padHalfX, input.padHalfZ);
  const spacing =
    radial <= padRadius + 14
      ? Math.max(minSpacing, 7.5)
      : radial <= padRadius + 28
        ? Math.max(minSpacing, 6.2)
        : minSpacing;

  if (!minSpacingOk(placements, x, z, spacing)) return false;
  if (!options?.skipDensityRoll) {
    const density =
      sampleWoodlandDensity(x, z, input.environmentSeed) *
      woodlandDistanceWeight(input, x, z, outerRadius) *
      (options?.densityBoost ?? 1);
    if (rng() > density) return false;
  }

  pushPlacement(
    placements,
    input,
    x,
    z,
    pickTreeAsset(rng, preferPine, input.pineMix),
    sampleTreeScale(rng, input),
    rng() * Math.PI * 2,
    waterLayout
  );
  return true;
}

/** Sparse accent trees outside the immediate facility buffer. */
function sampleNearPadEdge(
  rng: () => number,
  input: WoodlandTreePlacementInput,
  outerRadius: number
): { x: number; z: number } | null {
  const { centerX, centerZ, padHalfX, padHalfZ } = input;
  const side = Math.floor(rng() * 4);
  const alongPad = side % 2 === 0 ? padHalfX : padHalfZ;
  const along = (rng() * 2 - 1) * alongPad * 0.88;
  const outward = (side % 2 === 0 ? padHalfZ : padHalfX) + 10 + rng() * 22;
  let relX = 0;
  let relZ = 0;

  if (side === 0) {
    relX = along;
    relZ = outward;
  } else if (side === 1) {
    relX = outward;
    relZ = along;
  } else if (side === 2) {
    relX = along;
    relZ = -outward;
  } else {
    relX = -outward;
    relZ = along;
  }

  const x = centerX + relX;
  const z = centerZ + relZ;
  if (!isInGrassZone(relX, relZ, input, outerRadius, 1.2, 2.5)) return null;
  return { x, z };
}

/**
 * Naturalistic woodland scatter: patchy groves + grid-jitter fill + shrubs.
 * Uses Cartesian sampling (not radial rings) for organic distribution.
 */
export function computeWoodlandTreePlacements(
  input: WoodlandTreePlacementInput
): WoodlandTreePlacement[] {
  const rng = createSeededRandom(hashStringToSeed(`${input.environmentSeed}:woodland-trees`));
  const outerRadius = input.outerFade ? input.outerFade * 0.9 : input.fadeStart * 1.55;
  const placements: WoodlandTreePlacement[] = [];
  const densityScale = input.treeDensity ?? 1;
  const waterLayout = computeWoodlandWaterLayout(input, input.environmentSeed, waterOptionsFrom(input));

  const grassAreaEstimate =
    Math.PI * outerRadius * outerRadius - input.padHalfX * 2 * input.padHalfZ * 2;
  const targetTrees = Math.min(
    900,
    Math.max(160, Math.floor((Math.max(grassAreaEstimate, 1200) / 42) * densityScale))
  );

  // --- Light accent band outside the facility buffer (sparse, not a wall of trees) ---
  const nearEdgeAttempts = Math.floor(targetTrees * 0.1);
  for (let i = 0; i < nearEdgeAttempts; i++) {
    const sample = sampleNearPadEdge(rng, input, outerRadius);
    if (!sample) continue;
    const relZ = sample.z - input.centerZ;
    tryPlaceTree(placements, input, rng, sample.x, sample.z, outerRadius, 8.5, relZ > 0, waterLayout, {
      densityBoost: 0.82 * densityScale,
    });
  }

  // --- Grove clusters (small groups, irregular spacing) ---
  const clusterCount = Math.min(20, Math.max(7, Math.floor(targetTrees / 22)));
  for (let c = 0; c < clusterCount; c++) {
    let cx = 0;
    let cz = 0;
    let found = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = input.centerX + (rng() * 2 - 1) * outerRadius * 0.92;
      cz = input.centerZ + (rng() * 2 - 1) * outerRadius * 0.92;
      const relX = cx - input.centerX;
      const relZ = cz - input.centerZ;
      if (
        isInGrassZone(relX, relZ, input, outerRadius, 1, 2.5) &&
        radialDistanceFromCenter(input, cx, cz) > Math.max(input.padHalfX, input.padHalfZ) + 18 &&
        woodlandDistanceWeight(input, cx, cz, outerRadius) > 0.42 &&
        isAwayFromWater(cx, cz, waterLayout, TREE_WATER_CLEARANCE + 6)
      ) {
        found = true;
        break;
      }
    }
    if (!found) continue;

    const preferPine = cz > input.centerZ;
    const treesInCluster = 2 + Math.floor(rng() * 4);
    for (let t = 0; t < treesInCluster; t++) {
      const angle = rng() * Math.PI * 2;
      const dist = 2 + rng() * 9;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const relX = x - input.centerX;
      const relZ = z - input.centerZ;
      if (!isInGrassZone(relX, relZ, input, outerRadius, 0.9, 2)) continue;
      tryPlaceTree(placements, input, rng, x, z, outerRadius, 4.8, preferPine, waterLayout);
    }
  }

  // --- Stratified grid with jitter (fills the whole grass field, not a ring) ---
  const cellSize = 7.5;
  const gridExtent = outerRadius;
  const cols = Math.ceil((gridExtent * 2) / cellSize);
  const rows = cols;
  const cells: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col });
    }
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (const { row, col } of cells) {
    if (placements.length >= targetTrees) break;

    const baseX = input.centerX - gridExtent + col * cellSize + cellSize * 0.5;
    const baseZ = input.centerZ - gridExtent + row * cellSize + cellSize * 0.5;
    const jitterX = (rng() - 0.5) * cellSize * 0.92;
    const jitterZ = (rng() - 0.5) * cellSize * 0.92;
    const x = baseX + jitterX;
    const z = baseZ + jitterZ;

    const relX = x - input.centerX;
    const relZ = z - input.centerZ;
    if (!isInGrassZone(relX, relZ, input, outerRadius, 0.9, 2)) continue;

    tryPlaceTree(placements, input, rng, x, z, outerRadius, 6.2, relZ > 0, waterLayout);
  }

  // --- Extra scatter pass for gaps ---
  const scatterAttempts = targetTrees * 3;
  for (let i = 0; i < scatterAttempts && placements.length < targetTrees; i++) {
    const x = input.centerX + (rng() * 2 - 1) * outerRadius * 0.95;
    const z = input.centerZ + (rng() * 2 - 1) * outerRadius * 0.95;
    const relX = x - input.centerX;
    const relZ = z - input.centerZ;
    if (!isInGrassZone(relX, relZ, input, outerRadius, 0.9, 1.8)) continue;
    tryPlaceTree(placements, input, rng, x, z, outerRadius, 7.2, relZ > 0, waterLayout);
  }

  // --- Understory shrubs (sparse, smaller) ---
  const shrubTarget = Math.min(80, Math.max(18, Math.floor(placements.length * 0.22)));
  for (let i = 0; i < shrubTarget * 8 && countShrubs(placements) < shrubTarget; i++) {
    const x = input.centerX + (rng() * 2 - 1) * outerRadius * 0.9;
    const z = input.centerZ + (rng() * 2 - 1) * outerRadius * 0.9;
    const relX = x - input.centerX;
    const relZ = z - input.centerZ;
    if (!isInGrassZone(relX, relZ, input, outerRadius, 0.8, 1.5)) continue;
    if (!isAwayFromWater(x, z, waterLayout, SHRUB_WATER_CLEARANCE)) continue;
    if (!minSpacingOk(placements, x, z, 2.2)) continue;
    const shrubDensity =
      sampleWoodlandDensity(x, z, input.environmentSeed) *
      woodlandDistanceWeight(input, x, z, outerRadius) *
      0.55;
    if (rng() > shrubDensity) continue;

    pushPlacement(
      placements,
      input,
      x,
      z,
      'shrub-round',
      0.75 + rng() * 1.1,
      rng() * Math.PI * 2,
      waterLayout
    );
  }

  return placements;
}

function countShrubs(placements: WoodlandTreePlacement[]): number {
  return placements.filter((p) => p.assetId === 'shrub-round').length;
}
