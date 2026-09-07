/**
 * Load persisted terrain imagery + heightmap sidecars for the local ground preset.
 */

import * as bludesignApi from '@/api/bludesign';
import type { BluDesignEngine } from '../BluDesignEngine';
import type { FacilityData } from '../types';
import type { ScenePresetApplyOptions } from './ScenePresets';
import {
  getTerrainConfigFromFacility,
  type TerrainConfig,
} from './terrainConfigMetadata';

export type TerrainSidecarAssets = NonNullable<ScenePresetApplyOptions['terrain']>;

/** Sidecars fetched from persisted storage, including blobs for UI hydration. */
export type LoadedTerrainSidecars = TerrainSidecarAssets & {
  terrainDataId: string;
  imageryBlob: Blob;
  heightmapBlob: Blob;
};

type RetainedSidecarBlobs = {
  terrainDataId: string;
  config: TerrainConfig;
  imageryBlob: Blob;
  heightmapBlob: Blob;
};

const inFlightSidecarLoads = new Map<string, Promise<LoadedTerrainSidecars>>();

/** Blobs retained after a successful download so route changes can recreate object URLs without re-fetching. */
const retainedSidecarBlobs = new Map<string, RetainedSidecarBlobs>();

/** Serialize sidecar downloads — concurrent large heightmap requests cause ERR_NETWORK in dev. */
let sidecarNetworkChain: Promise<unknown> = Promise.resolve();

function enqueueSidecarNetwork<T>(fn: () => Promise<T>): Promise<T> {
  const next = sidecarNetworkChain.then(fn, fn);
  sidecarNetworkChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function sidecarLoadKey(config: TerrainConfig, facilityId?: string | null): string {
  const resolved = resolveTerrainConfigForLoad(config, facilityId);
  return `${resolved.terrainDataId}:${resolved.fetchedAt}`;
}

function createLoadedSidecars(entry: RetainedSidecarBlobs): LoadedTerrainSidecars {
  return {
    terrainDataId: entry.terrainDataId,
    config: entry.config,
    imageryBlob: entry.imageryBlob,
    heightmapBlob: entry.heightmapBlob,
    imageryUrl: URL.createObjectURL(entry.imageryBlob),
    heightmapUrl: URL.createObjectURL(entry.heightmapBlob),
  };
}

/** Drop retained blobs after terrain delete or when replacing terrain data. */
export function forgetRetainedTerrainSidecars(terrainDataId?: string): void {
  if (!terrainDataId) {
    retainedSidecarBlobs.clear();
    return;
  }
  for (const key of [...retainedSidecarBlobs.keys()]) {
    if (key.startsWith(`${terrainDataId}:`)) {
      retainedSidecarBlobs.delete(key);
    }
  }
}

/** Resolve terrain data id, including legacy facilities that used facility id as the key. */
export function resolveTerrainConfigForLoad(
  config: TerrainConfig,
  facilityId?: string | null
): TerrainConfig {
  const terrainDataId =
    config.terrainDataId?.trim() || (facilityId?.trim() ? facilityId.trim() : '');
  if (!terrainDataId) {
    throw new Error('Terrain config is missing terrainDataId');
  }
  return config.terrainDataId === terrainDataId ? config : { ...config, terrainDataId };
}

export async function fetchTerrainSidecarAssets(
  config: TerrainConfig,
  facilityId?: string | null
): Promise<LoadedTerrainSidecars> {
  const resolved = resolveTerrainConfigForLoad(config, facilityId);
  const { terrainDataId } = resolved;
  const loadKey = sidecarLoadKey(config, facilityId);

  const retained = retainedSidecarBlobs.get(loadKey);
  if (retained) {
    return createLoadedSidecars(retained);
  }

  const inFlight = inFlightSidecarLoads.get(loadKey);
  if (inFlight) return inFlight;

  const promise = enqueueSidecarNetwork(async () => {
    const heightmapBlob = await bludesignApi.getTerrainHeightmap(terrainDataId);
    const imageryBlob = await bludesignApi.getTerrainImagery(terrainDataId);

    const entry: RetainedSidecarBlobs = {
      terrainDataId,
      config: resolved,
      imageryBlob,
      heightmapBlob,
    };
    retainedSidecarBlobs.set(loadKey, entry);
    return createLoadedSidecars(entry);
  });

  inFlightSidecarLoads.set(loadKey, promise);
  try {
    return await promise;
  } finally {
    if (inFlightSidecarLoads.get(loadKey) === promise) {
      inFlightSidecarLoads.delete(loadKey);
    }
  }
}

export function revokeTerrainSidecarAssets(
  assets: TerrainSidecarAssets | null | undefined
): void {
  if (!assets) return;
  try {
    URL.revokeObjectURL(assets.imageryUrl);
  } catch {
    // ignore
  }
  try {
    URL.revokeObjectURL(assets.heightmapUrl);
  } catch {
    // ignore
  }
}

/** Fetch sidecars (when present) and apply the local ground preset in the editor/viewer. */
export async function applyStoredTerrainToEngine(
  engine: BluDesignEngine,
  facilityId: string,
  data: FacilityData
): Promise<TerrainSidecarAssets | null> {
  const config = getTerrainConfigFromFacility(data);
  if (!config) {
    return null;
  }
  const resolved = resolveTerrainConfigForLoad(config, facilityId);

  try {
    const terrain = await fetchTerrainSidecarAssets(resolved, facilityId);
    await engine.applyGroundPreset('local', { terrain });
    if (!config.terrainDataId) {
      engine.setTerrainConfig(resolved);
    }
    engine.setLoadedTerrainSidecars(terrain);
    return terrain;
  } catch (error) {
    console.warn('Terrain sidecars unavailable:', error);
    await engine.clearTerrainGround();
    return null;
  }
}
