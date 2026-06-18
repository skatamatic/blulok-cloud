import type { ImageryTileProvider } from '../imagery-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult, fetchTileBuffer } from './fetch-utils';

export interface MapboxSatelliteConfig {
  accessToken: string;
}

/**
 * Mapbox Satellite imagery tiles.
 */
export class MapboxSatelliteProvider implements ImageryTileProvider {
  readonly id = 'mapbox-satellite' as const;

  constructor(private readonly config: MapboxSatelliteConfig) {}

  private tileUrl(tile: TileCoordinate): string {
    return `https://api.mapbox.com/v4/mapbox.satellite/${tile.z}/${tile.x}/${tile.y}.jpg?access_token=${encodeURIComponent(this.config.accessToken)}`;
  }

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const url = this.tileUrl(tile);
    const { data, contentType } = await fetchTileBuffer(url, 'Mapbox Satellite');
    return buildTileFetchResult(data, contentType, tile);
  }

  getAttribution(): string {
    return 'Imagery: Mapbox, Maxar';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.fetchTile({ z: 15, x: 5240, y: 12662 });
      return result.data.length > 100;
    } catch {
      return false;
    }
  }
}
