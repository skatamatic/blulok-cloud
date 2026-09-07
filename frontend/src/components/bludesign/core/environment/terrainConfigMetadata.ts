/**
 * Persisted site terrain metadata on FacilityData.
 *
 * Imagery and heightmap are stored as facility sidecars;
 * this struct holds geo params, alignment transform, and file references.
 */

import type { FacilityData } from '../types';

export const TERRAIN_IMAGERY_FILENAME = 'terrain-imagery.jpg' as const;
export const TERRAIN_HEIGHTMAP_FILENAME = 'terrain-heightmap.png' as const;

export interface GeoBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export type TerrainDetailLevel = 'low' | 'med' | 'max';

export const DEFAULT_TERRAIN_DETAIL_LEVEL: TerrainDetailLevel = 'max';

export const TERRAIN_DETAIL_LEVEL_OPTIONS: ReadonlyArray<{
  value: TerrainDetailLevel;
  label: string;
}> = [
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'max', label: 'Max' },
];

export function normalizeTerrainDetailLevel(value: unknown): TerrainDetailLevel {
  if (value === 'low' || value === 'med' || value === 'max') return value;
  return DEFAULT_TERRAIN_DETAIL_LEVEL;
}

export interface TerrainConfig {
  version: 1;
  terrainDataId: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  detailLevel: TerrainDetailLevel;
  imageryZoom: number;
  elevationZoom: number;
  imageryMetersPerPixel: number;
  bounds: GeoBounds;
  worldSizeMeters: number;
  offset: { x: number; y: number; z: number };
  scale: number;
  rotationDeg: number;
  elevationAmplitude: number;
  baseOpacity: number;
  heightMinM: number;
  heightMaxM: number;
  meshWidth: number;
  meshHeight: number;
  imageryFile: typeof TERRAIN_IMAGERY_FILENAME;
  heightmapFile: typeof TERRAIN_HEIGHTMAP_FILENAME;
  fetchedAt: string;
  providers: { elevation: string; imagery: string };
  attribution: { elevation: string; imagery: string };
}

export type TerrainTransform = {
  offset: { x: number; y: number; z: number };
  scale: number;
  rotationDeg: number;
  elevationAmplitude: number;
  baseOpacity: number;
};

export const DEFAULT_TERRAIN_TRANSFORM: TerrainTransform = {
  offset: { x: 0, y: 0, z: 0 },
  scale: 1,
  rotationDeg: 0,
  elevationAmplitude: 1,
  baseOpacity: 1,
};

export interface SiteTerrainFetchMeta {
  width: number;
  height: number;
  minM: number;
  maxM: number;
  imageryZoom: number;
  elevationZoom: number;
  detailLevel?: TerrainDetailLevel;
  imageryMetersPerPixel: number;
  bounds: GeoBounds;
  providers: { elevation: string; imagery: string };
  attribution: { elevation: string; imagery: string };
  worldSizeMeters: number;
}

export function normalizeTerrainConfig(raw: unknown): TerrainConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<TerrainConfig>;
  if (t.version !== 1) return null;

  const lat = Number(t.center?.lat);
  const lng = Number(t.center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const radiusMeters = Number(t.radiusMeters);
  const meshWidth = Number(t.meshWidth);
  const meshHeight = Number(t.meshHeight);
  if (!(radiusMeters > 0) || !(meshWidth > 0) || !(meshHeight > 0)) return null;

  const bounds = t.bounds;
  if (
    !bounds ||
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west)
  ) {
    return null;
  }

  const terrainDataId =
    typeof t.terrainDataId === 'string' && t.terrainDataId.trim()
      ? t.terrainDataId.trim()
      : '';

  return {
    version: 1,
    terrainDataId,
    center: { lat, lng },
    radiusMeters,
    detailLevel: normalizeTerrainDetailLevel(t.detailLevel),
    imageryZoom: Number(t.imageryZoom) || 15,
    elevationZoom: Number(t.elevationZoom) || 15,
    imageryMetersPerPixel: Number(t.imageryMetersPerPixel) || 1,
    bounds: { ...bounds },
    worldSizeMeters: Number(t.worldSizeMeters) || radiusMeters * 2,
    offset: {
      x: Number(t.offset?.x) || 0,
      y: Number(t.offset?.y) || 0,
      z: Number(t.offset?.z) || 0,
    },
    scale: Number(t.scale) > 0 ? Number(t.scale) : 1,
    rotationDeg: Number(t.rotationDeg) || 0,
    elevationAmplitude: Number(t.elevationAmplitude) > 0 ? Number(t.elevationAmplitude) : 1,
    baseOpacity: Number.isFinite(Number(t.baseOpacity))
      ? Math.max(0, Math.min(1, Number(t.baseOpacity)))
      : 1,
    heightMinM: Number(t.heightMinM) || 0,
    heightMaxM: Number(t.heightMaxM) || 0,
    meshWidth,
    meshHeight,
    imageryFile: TERRAIN_IMAGERY_FILENAME,
    heightmapFile: TERRAIN_HEIGHTMAP_FILENAME,
    fetchedAt: typeof t.fetchedAt === 'string' ? t.fetchedAt : new Date().toISOString(),
    providers: {
      elevation: t.providers?.elevation ?? 'terrarium',
      imagery: t.providers?.imagery ?? 'esri-world-imagery',
    },
    attribution: {
      elevation: t.attribution?.elevation ?? '',
      imagery: t.attribution?.imagery ?? '',
    },
  };
}

export function getTerrainConfigFromFacility(
  data: FacilityData | null | undefined
): TerrainConfig | null {
  return normalizeTerrainConfig(data?.terrainConfig);
}

export function hasTerrainConfig(
  data: FacilityData | null | undefined
): data is FacilityData & { terrainConfig: TerrainConfig } {
  return getTerrainConfigFromFacility(data) !== null;
}

export function attachTerrainConfigToFacilityData(
  data: FacilityData,
  terrainConfig: TerrainConfig | null | undefined
): FacilityData {
  if (!terrainConfig) {
    const { terrainConfig: _, ...rest } = data;
    return rest as FacilityData;
  }
  return { ...data, terrainConfig };
}

export function stripTerrainConfigFromFacilityData(data: FacilityData): FacilityData {
  const { terrainConfig: _, ...rest } = data;
  return rest as FacilityData;
}

export function buildTerrainConfigFromFetch(
  terrainDataId: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  meta: SiteTerrainFetchMeta,
  transform: Partial<TerrainTransform> = {},
  detailLevel: TerrainDetailLevel = normalizeTerrainDetailLevel(meta.detailLevel)
): TerrainConfig {
  const merged = { ...DEFAULT_TERRAIN_TRANSFORM, ...transform };
  return {
    version: 1,
    terrainDataId,
    center,
    radiusMeters,
    detailLevel,
    imageryZoom: meta.imageryZoom,
    elevationZoom: meta.elevationZoom,
    imageryMetersPerPixel: meta.imageryMetersPerPixel,
    bounds: meta.bounds,
    worldSizeMeters: meta.worldSizeMeters,
    offset: { ...merged.offset },
    scale: merged.scale,
    rotationDeg: merged.rotationDeg,
    elevationAmplitude: merged.elevationAmplitude,
    baseOpacity: merged.baseOpacity,
    heightMinM: meta.minM,
    heightMaxM: meta.maxM,
    meshWidth: meta.width,
    meshHeight: meta.height,
    imageryFile: TERRAIN_IMAGERY_FILENAME,
    heightmapFile: TERRAIN_HEIGHTMAP_FILENAME,
    fetchedAt: new Date().toISOString(),
    providers: meta.providers,
    attribution: meta.attribution,
  };
}
