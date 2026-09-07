import type { ElevationTileProvider } from '../elevation-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult, fetchTileBuffer } from './fetch-utils';

const TERRARIUM_BASE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/**
 * AWS public Mapzen Terrarium elevation tiles (no API key required).
 */
export class TerrariumElevationProvider implements ElevationTileProvider {
  readonly id = 'terrarium' as const;
  readonly encoding = 'terrarium' as const;

  private tileUrl(tile: TileCoordinate): string {
    return `${TERRARIUM_BASE}/${tile.z}/${tile.x}/${tile.y}.png`;
  }

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const url = this.tileUrl(tile);
    const { data, contentType } = await fetchTileBuffer(url, 'Terrarium elevation');
    return buildTileFetchResult(data, contentType, tile);
  }

  getAttribution(): string {
    return 'Elevation: Mapzen Terrain Tiles (AWS Open Data)';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.fetchTile({ z: 15, x: 5240, y: 12662 });
      return result.data.length > 8 && result.data[0] === 0x89;
    } catch {
      return false;
    }
  }
}
