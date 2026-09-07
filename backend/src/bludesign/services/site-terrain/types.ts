/**
 * Site terrain tile types — elevation and imagery providers share tile coordinates
 * but use separate provider interfaces.
 */

import type { TerrainDetailLevel } from './tile-math';

export type { TerrainDetailLevel };

export type ElevationProviderId = 'terrarium' | 'mapbox-terrain-rgb' | 'stub';
export type ImageryProviderId = 'esri-world-imagery' | 'mapbox-satellite' | 'stub';
export type ElevationEncoding = 'terrarium' | 'mapbox-rgb';

export interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface TileFetchResult {
  data: Buffer;
  contentType: string;
  tile: TileCoordinate;
  byteLength: number;
}

export interface FetchSitePackRequest {
  center: GeoPoint;
  /** Radius in meters around center (default 400). */
  radiusMeters?: number;
  /**
   * Fetch resolution preset. When omitted, defaults to `max` (~1 m/px imagery, z15 elevation).
   * Explicit imageryZoom / elevationZoom override this.
   */
  detailLevel?: TerrainDetailLevel;
  /**
   * Legacy single zoom for both layers. Prefer imageryZoom / elevationZoom.
   * When omitted, imagery auto-picks from detailLevel (max ≈ ~1 m/px up to z18); elevation uses z15 at max.
   */
  zoom?: number;
  /** Satellite/aerial detail — Esri supports up to ~z19 in urban areas. */
  imageryZoom?: number;
  /** DEM detail — Terrarium/Mapbox cap at z15; upsampled to match imagery if higher. */
  elevationZoom?: number;
}

export interface SitePackElevation {
  encoding: ElevationEncoding;
  width: number;
  height: number;
  heights: Float32Array;
  minM: number;
  maxM: number;
}

export interface SitePackImagery {
  width: number;
  height: number;
  /** Raw RGBA pixels (width * height * 4). */
  rgba: Buffer;
}

export interface SitePackResult {
  bounds: GeoBounds;
  /** @deprecated Use imageryZoom — kept for compatibility */
  zoom: number;
  imageryZoom: number;
  elevationZoom: number;
  /** Meters per pixel of imagery at center latitude */
  imageryMetersPerPixel: number;
  elevation: SitePackElevation;
  imagery: SitePackImagery;
  tilesFetched: { elevation: number; imagery: number };
  attribution: { elevation: string; imagery: string };
  providers: { elevation: ElevationProviderId; imagery: ImageryProviderId };
}

export interface SiteTerrainProviderConfig {
  elevation: ElevationProviderId;
  imagery: ImageryProviderId;
}

export enum SiteTerrainErrorCode {
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  FETCH_FAILED = 'FETCH_FAILED',
  DECODE_FAILED = 'DECODE_FAILED',
  INVALID_BOUNDS = 'INVALID_BOUNDS',
}

export class SiteTerrainError extends Error {
  constructor(
    message: string,
    public readonly code: SiteTerrainErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SiteTerrainError';
  }
}
