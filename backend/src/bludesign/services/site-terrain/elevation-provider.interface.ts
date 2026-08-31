import type { ElevationEncoding, ElevationProviderId, TileCoordinate, TileFetchResult } from './types';

export interface ElevationTileProvider {
  readonly id: ElevationProviderId;
  readonly encoding: ElevationEncoding;
  fetchTile(tile: TileCoordinate): Promise<TileFetchResult>;
  getAttribution(): string;
  healthCheck(): Promise<boolean>;
}
