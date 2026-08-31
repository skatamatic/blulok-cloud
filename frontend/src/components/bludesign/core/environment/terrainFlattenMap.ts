/**
 * CPU influence map: flatten terrain relief near facility asset footprints.
 */

import * as THREE from 'three';
import type { AssetFootprintXZ } from './terrainAssetFootprints';

export const TERRAIN_FLATTEN_MAP_SIZE = 256;

export type TerrainFlattenMapResult = {
  texture: THREE.DataTexture;
  originX: number;
  originZ: number;
  spanX: number;
  spanZ: number;
};

/** Distance from (x,z) to the edge of an axis-aligned footprint (0 inside). */
export function boxDistanceXZ(
  x: number,
  z: number,
  footprint: AssetFootprintXZ
): number {
  const dx = Math.max(footprint.minX - x, 0, x - footprint.maxX);
  const dz = Math.max(footprint.minZ - z, 0, z - footprint.maxZ);
  return Math.hypot(dx, dz);
}

export function computeFlattenInfluence(
  distanceToBox: number,
  fadeDistance: number,
  blend: number
): number {
  if (blend <= 0 || fadeDistance <= 0) return 0;
  const t = THREE.MathUtils.clamp(1 - distanceToBox / fadeDistance, 0, 1);
  return t * blend;
}

export function buildTerrainFlattenMap(params: {
  footprints: AssetFootprintXZ[];
  boundsMinX: number;
  boundsMinZ: number;
  boundsMaxX: number;
  boundsMaxZ: number;
  distance: number;
  blend: number;
  mapSize?: number;
}): TerrainFlattenMapResult | null {
  const {
    footprints,
    boundsMinX,
    boundsMinZ,
    boundsMaxX,
    boundsMaxZ,
    distance,
    blend,
    mapSize = TERRAIN_FLATTEN_MAP_SIZE,
  } = params;

  if (footprints.length === 0) return null;

  const spanX = Math.max(boundsMaxX - boundsMinX, 1);
  const spanZ = Math.max(boundsMaxZ - boundsMinZ, 1);
  const data = new Float32Array(mapSize * mapSize);

  for (let py = 0; py < mapSize; py++) {
    const tz = (py + 0.5) / mapSize;
    const worldZ = boundsMinZ + tz * spanZ;

    for (let px = 0; px < mapSize; px++) {
      const tx = (px + 0.5) / mapSize;
      const worldX = boundsMinX + tx * spanX;

      let influence = 0;
      for (const footprint of footprints) {
        const dist = boxDistanceXZ(worldX, worldZ, footprint);
        influence = Math.max(
          influence,
          computeFlattenInfluence(dist, distance, blend)
        );
      }

      data[py * mapSize + px] = influence;
    }
  }

  const texture = new THREE.DataTexture(data, mapSize, mapSize, THREE.RedFormat, THREE.FloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return {
    texture,
    originX: boundsMinX,
    originZ: boundsMinZ,
    spanX,
    spanZ,
  };
}
