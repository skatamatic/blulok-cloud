import { hashStringToSeed } from './deterministicRandom';
import {
  carveWoodlandWaterHeight,
  woodlandWaterSignedDistance,
  type WoodlandWaterLayout,
} from './woodlandWater';

/** Shared tuning — keep in sync with `GroundPlaneManager` hill shader uniforms. */
export const WOODLAND_HILL_AMPLITUDE = 18;
export const WOODLAND_HILL_NOISE_SCALE = 0.004;
export const WOODLAND_HILL_CLEARING_MARGIN_MIN = 18;
export const WOODLAND_HILL_CLEARING_MARGIN_RATIO = 0.32;

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 0.013) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);

  return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

function fbm2(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amplitude = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2(px, py, seed + i * 17);
    px *= 2;
    py *= 2;
    amplitude *= 0.5;
  }
  return value;
}

function shapeHillNoise(raw: number): number {
  return Math.max(0, Math.min(1, raw * 1.18 - 0.06));
}

function signedHillNoise(raw: number): number {
  return Math.max(-1, Math.min(1, (raw - 0.5) * 2.2));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function hillSeedVec2(environmentSeed: string): { x: number; y: number } {
  const seed = hashStringToSeed(environmentSeed);
  return {
    x: (seed % 1000) * 0.1,
    y: (seed % 7000) * 0.01,
  };
}

/** Patchy density multiplier for woodland scatter (0.2–1). */
export function sampleWoodlandDensity(
  worldX: number,
  worldZ: number,
  environmentSeed: string
): number {
  const seed = hashStringToSeed(`${environmentSeed}:density`);
  const nx = worldX * 0.0035 + seed * 0.0007;
  const nz = worldZ * 0.0035 + seed * 0.0011;
  const raw = fbm2(nx, nz, seed, 3);
  return 0.22 + shapeHillNoise(raw) * 0.78;
}

function combinedHillNoise(worldX: number, worldZ: number, seed: number): number {
  const nx = worldX * WOODLAND_HILL_NOISE_SCALE + seed * 0.001;
  const nz = worldZ * WOODLAND_HILL_NOISE_SCALE + seed * 0.002;
  const detail = fbm2(nx, nz, seed, 4);
  const broad = fbm2(nx * 0.42 + 11.7, nz * 0.42 + 6.3, seed + 91, 3);
  return signedHillNoise(detail * 0.42 + broad * 0.58);
}

export function woodlandHillClearingHalf(
  padHalfX: number,
  padHalfZ: number
): { x: number; z: number } {
  const margin = Math.max(
    WOODLAND_HILL_CLEARING_MARGIN_MIN,
    Math.max(padHalfX, padHalfZ) * WOODLAND_HILL_CLEARING_MARGIN_RATIO
  );
  return {
    x: padHalfX + margin,
    z: padHalfZ + margin,
  };
}

/** Rolling-hill height (world Y). Flat on the facility pad, rises in the grass surround. */
export function sampleWoodlandTerrainHeight(
  worldX: number,
  worldZ: number,
  centerX: number,
  centerZ: number,
  padHalfX: number,
  padHalfZ: number,
  environmentSeed: string,
  amplitude = WOODLAND_HILL_AMPLITUDE,
  waterLayout?: WoodlandWaterLayout
): number {
  const relX = worldX - centerX;
  const relZ = worldZ - centerZ;
  const clearing = woodlandHillClearingHalf(padHalfX, padHalfZ);
  const outsideX = Math.max(Math.abs(relX) - clearing.x, 0);
  const outsideZ = Math.max(Math.abs(relZ) - clearing.z, 0);
  const edgeDist = Math.max(outsideX, outsideZ);
  if (edgeDist <= 0) return 0;

  const transition = Math.max(clearing.x, clearing.z) * 0.22;
  const hillMask = smoothstep(0, transition, edgeDist);

  const seed = hashStringToSeed(environmentSeed);
  const natural = combinedHillNoise(worldX, worldZ, seed) * amplitude * hillMask;

  if (waterLayout?.enabled) {
    const signed = woodlandWaterSignedDistance(worldX, worldZ, waterLayout);
    return carveWoodlandWaterHeight(natural, signed, waterLayout);
  }
  return natural;
}
