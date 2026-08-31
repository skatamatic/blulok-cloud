import type { ImageryProviderId, TileCoordinate, TileFetchResult } from './types';

export interface ImageryTileProvider {
  readonly id: ImageryProviderId;
  fetchTile(tile: TileCoordinate): Promise<TileFetchResult>;
  getAttribution(): string;
  healthCheck(): Promise<boolean>;
}
