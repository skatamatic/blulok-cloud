import type { ElevationTileProvider } from '../elevation-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult, fetchTileBuffer } from './fetch-utils';

export interface MapboxTerrainRgbConfig {
  accessToken: string;
}

/**
 * Mapbox Terrain-RGB elevation tiles.
 */
export class MapboxTerrainRgbProvider implements ElevationTileProvider {
  readonly id = 'mapbox-terrain-rgb' as const;
  readonly encoding = 'mapbox-rgb' as const;

  constructor(private readonly config: MapboxTerrainRgbConfig) {}

  private tileUrl(tile: TileCoordinate): string {
    return `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile.z}/${tile.x}/${tile.y}.pngraw?access_token=${encodeURIComponent(this.config.accessToken)}`;
  }

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const url = this.tileUrl(tile);
    const { data, contentType } = await fetchTileBuffer(url, 'Mapbox Terrain-RGB');
    return buildTileFetchResult(data, contentType, tile);
  }

  getAttribution(): string {
    return 'Elevation: Mapbox';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.fetchTile({ z: 15, x: 5240, y: 12662 });
      return result.data.length > 8;
    } catch {
      return false;
    }
  }
}
