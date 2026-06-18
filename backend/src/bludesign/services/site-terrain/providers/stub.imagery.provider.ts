import sharp from 'sharp';
import type { ImageryTileProvider } from '../imagery-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult } from './fetch-utils';

const TILE_SIZE = 256;

/**
 * Deterministic stub imagery tiles — color gradient by tile x/y.
 */
export class StubImageryProvider implements ImageryTileProvider {
  readonly id = 'stub' as const;

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const rgba = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
    const baseR = (tile.x * 37) % 256;
    const baseG = (tile.y * 53) % 256;
    const baseB = ((tile.x + tile.y) * 19) % 256;

    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const i = (py * TILE_SIZE + px) * 4;
        rgba[i] = (baseR + px) % 256;
        rgba[i + 1] = (baseG + py) % 256;
        rgba[i + 2] = baseB;
        rgba[i + 3] = 255;
      }
    }

    const jpeg = await sharp(rgba, {
      raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
    })
      .jpeg({ quality: 85 })
      .toBuffer();

    return buildTileFetchResult(jpeg, 'image/jpeg', tile);
  }

  getAttribution(): string {
    return 'Stub imagery (test only)';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
