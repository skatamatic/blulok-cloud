import sharp from 'sharp';
import type { ElevationTileProvider } from '../elevation-provider.interface';
import type { TileCoordinate, TileFetchResult } from '../types';
import { buildTileFetchResult } from './fetch-utils';

const TILE_SIZE = 256;

function encodeTerrariumHeightMeters(heightM: number): [number, number, number] {
  const encoded = heightM + 32768;
  const r = Math.min(255, Math.floor(encoded / 256));
  const g = Math.min(255, Math.floor(encoded % 256));
  const b = Math.min(255, Math.floor((encoded % 1) * 256));
  return [r, g, b];
}

/**
 * Deterministic stub elevation tiles for unit tests — height increases with x+y.
 */
export class StubElevationProvider implements ElevationTileProvider {
  readonly id = 'stub' as const;
  readonly encoding = 'terrarium' as const;

  async fetchTile(tile: TileCoordinate): Promise<TileFetchResult> {
    const rgba = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const i = (py * TILE_SIZE + px) * 4;
        const heightM = 100 + tile.x * 0.1 + tile.y * 0.05 + px * 0.01 + py * 0.01;
        const [r, g, b] = encodeTerrariumHeightMeters(heightM);
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }

    const png = await sharp(rgba, {
      raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
    })
      .png()
      .toBuffer();

    return buildTileFetchResult(png, 'image/png', tile);
  }

  getAttribution(): string {
    return 'Stub elevation (test only)';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
