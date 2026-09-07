import type { ImageryTileProvider } from '../imagery-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult, fetchTileBuffer } from './fetch-utils';

const ESRI_IMAGERY_BASE =
  'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile';

export interface EsriWorldImageryConfig {
  apiKey: string;
}

/**
 * Esri World Imagery satellite tiles (free tier: 2M tiles/month with API key).
 */
export class EsriWorldImageryProvider implements ImageryTileProvider {
  readonly id = 'esri-world-imagery' as const;

  constructor(private readonly config: EsriWorldImageryConfig) {}

  private tileUrl(tile: TileCoordinate): string {
    return `${ESRI_IMAGERY_BASE}/${tile.z}/${tile.y}/${tile.x}?token=${encodeURIComponent(this.config.apiKey)}`;
  }

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const url = this.tileUrl(tile);
    const { data, contentType } = await fetchTileBuffer(url, 'Esri World Imagery');
    return buildTileFetchResult(data, contentType, tile);
  }

  getAttribution(): string {
    return 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.fetchTile({ z: 15, x: 9644, y: 12315 });
      return result.data.length > 100;
    } catch {
      return false;
    }
  }
}
