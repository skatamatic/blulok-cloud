/**
 * Web Mercator tile math for site terrain fetching and stitching.
 */

import type { GeoBounds, GeoPoint, TileCoordinate } from './types';

const TILE_SIZE = 256;
const EARTH_RADIUS_M = 6378137;
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M;

export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - mercN / Math.PI) / 2) * Math.pow(2, zoom));
}

/** Continuous pixel X in world space at zoom (top-left origin of tile grid). */
export function lngToPixelX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}

/** Continuous pixel Y in world space at zoom (north = smaller Y). */
export function latToPixelY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return ((1 - mercN / Math.PI) / 2) * TILE_SIZE * Math.pow(2, zoom);
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * Math.pow(2, zoom));
}

/** Approximate geo bounds from center + radius in meters. */
export function boundsFromCenterRadius(center: GeoPoint, radiusMeters: number): GeoBounds {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}

export function tileKey(tile: TileCoordinate): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/** Unique tiles covering a geographic bounding box at zoom. */
export function tilesForBounds(bounds: GeoBounds, zoom: number): TileCoordinate[] {
  const minX = lngToTileX(bounds.west, zoom);
  const maxX = lngToTileX(bounds.east, zoom);
  const minY = latToTileY(bounds.north, zoom);
  const maxY = latToTileY(bounds.south, zoom);

  const tiles: TileCoordinate[] = [];
  const seen = new Set<string>();

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const tile = { z: zoom, x, y };
      const key = tileKey(tile);
      if (!seen.has(key)) {
        seen.add(key);
        tiles.push(tile);
      }
    }
  }

  return tiles;
}

export interface TileGridExtents {
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function tileGridExtents(bounds: GeoBounds, zoom: number): TileGridExtents {
  const minTileX = lngToTileX(bounds.west, zoom);
  const maxTileX = lngToTileX(bounds.east, zoom);
  const minTileY = latToTileY(bounds.north, zoom);
  const maxTileY = latToTileY(bounds.south, zoom);

  return {
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    canvasWidth: (maxTileX - minTileX + 1) * TILE_SIZE,
    canvasHeight: (maxTileY - minTileY + 1) * TILE_SIZE,
  };
}

/** Pixel crop rectangle within a stitched tile canvas for exact geo bounds. */
export interface PixelCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function cropRectForBounds(
  bounds: GeoBounds,
  zoom: number,
  extents: TileGridExtents
): PixelCropRect {
  const worldLeft = lngToPixelX(bounds.west, zoom);
  const worldRight = lngToPixelX(bounds.east, zoom);
  const worldTop = latToPixelY(bounds.north, zoom);
  const worldBottom = latToPixelY(bounds.south, zoom);

  const canvasLeft = extents.minTileX * TILE_SIZE;
  const canvasTop = extents.minTileY * TILE_SIZE;

  const left = Math.max(0, Math.floor(worldLeft - canvasLeft));
  const top = Math.max(0, Math.floor(worldTop - canvasTop));
  const right = Math.min(extents.canvasWidth, Math.ceil(worldRight - canvasLeft));
  const bottom = Math.min(extents.canvasHeight, Math.ceil(worldBottom - canvasTop));

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** Terrarium / Mapbox DEM tiles stop at z15. */
export const MAX_ELEVATION_ZOOM = 15;

/** Esri World Imagery is typically available to z18–19 in populated areas. */
export const MAX_IMAGERY_ZOOM = 18;

export type TerrainDetailLevel = 'low' | 'med' | 'max';

const DETAIL_LEVEL_IMAGERY_ZOOM_OFFSET: Record<TerrainDetailLevel, number> = {
  max: 0,
  med: 2,
  low: 4,
};

const DETAIL_LEVEL_ELEVATION_ZOOM: Record<TerrainDetailLevel, number> = {
  low: 11,
  med: 13,
  max: MAX_ELEVATION_ZOOM,
};

export function parseTerrainDetailLevel(value: unknown): TerrainDetailLevel {
  if (value === 'low' || value === 'med' || value === 'max') return value;
  return 'max';
}

function maxDetailImageryZoom(lat: number): number {
  const targetMetersPerPixel = 1;
  for (let z = MAX_IMAGERY_ZOOM; z >= 10; z--) {
    if (metersPerPixel(lat, z) <= targetMetersPerPixel) {
      return z;
    }
  }
  return 10;
}

/** Pick elevation zoom for a detail preset (DEM sources cap at {@link MAX_ELEVATION_ZOOM}). */
export function autoElevationZoomForDetail(detailLevel: TerrainDetailLevel): number {
  return Math.min(DETAIL_LEVEL_ELEVATION_ZOOM[detailLevel], MAX_ELEVATION_ZOOM);
}

/**
 * Pick imagery zoom for a detail preset — max targets ~1 m/px; lower presets step down tile zoom.
 */
export function autoImageryZoomForDetail(
  lat: number,
  _radiusMeters: number,
  detailLevel: TerrainDetailLevel
): number {
  const finestZoom = maxDetailImageryZoom(lat);
  const zoom = finestZoom - DETAIL_LEVEL_IMAGERY_ZOOM_OFFSET[detailLevel];
  return Math.min(Math.max(10, zoom), MAX_IMAGERY_ZOOM);
}

/** Pick elevation zoom (DEM sources cap at {@link MAX_ELEVATION_ZOOM}). */
export function autoElevationZoom(): number {
  return autoElevationZoomForDetail('max');
}

/**
 * Pick imagery zoom targeting ~1 m/px for site surroundings (roads, adjacent lots, tree lines).
 */
export function autoImageryZoomForRadius(lat: number, radiusMeters: number): number {
  return autoImageryZoomForDetail(lat, radiusMeters, 'max');
}

/** @deprecated Use autoImageryZoomForRadius + autoElevationZoom for split zoom. */
export function autoZoomForRadius(lat: number, radiusMeters: number): number {
  const targetMetersPerPixel = Math.max(radiusMeters / 200, 0.5);
  for (let z = MAX_ELEVATION_ZOOM; z >= 0; z--) {
    if (metersPerPixel(lat, z) <= targetMetersPerPixel) {
      return z;
    }
  }
  return MAX_ELEVATION_ZOOM;
}

export const TILE_PIXEL_SIZE = TILE_SIZE;
