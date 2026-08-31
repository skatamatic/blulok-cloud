import sharp from 'sharp';
import { decodeElevationTile } from './elevation-decoders';
import type { ElevationTileProvider } from './elevation-provider.interface';
import type { ImageryTileProvider } from './imagery-provider.interface';
import { mapWithConcurrency } from './concurrency';
import {
  TILE_PIXEL_SIZE,
  cropRectForBounds,
  tileGridExtents,
  tilesForBounds,
} from './tile-math';
import {
  SiteTerrainError,
  SiteTerrainErrorCode,
  type GeoBounds,
  type SitePackElevation,
  type SitePackImagery,
  type TileCoordinate,
} from './types';

const DEFAULT_CONCURRENCY = 6;

export interface StitchSiteTerrainInput {
  bounds: GeoBounds;
  imageryZoom: number;
  elevationZoom: number;
  elevationProvider: ElevationTileProvider;
  imageryProvider: ImageryTileProvider;
  concurrency?: number;
}

export interface StitchSiteTerrainResult {
  elevation: SitePackElevation;
  imagery: SitePackImagery;
  tilesFetched: { elevation: number; imagery: number };
}

async function decodeImageToRgba(data: Buffer): Promise<{ rgba: Buffer; width: number; height: number }> {
  const { data: rgba, info } = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba, width: info.width, height: info.height };
}

function placeTileRgba(
  canvas: Buffer,
  canvasWidth: number,
  tileRgba: Buffer,
  tileWidth: number,
  tileHeight: number,
  destX: number,
  destY: number
): void {
  for (let row = 0; row < tileHeight; row++) {
    const srcRow = row * tileWidth * 4;
    const dstRow = ((destY + row) * canvasWidth + destX) * 4;
    tileRgba.copy(canvas, dstRow, srcRow, srcRow + tileWidth * 4);
  }
}

function placeTileHeights(
  canvas: Float32Array,
  canvasWidth: number,
  tileHeights: Float32Array,
  tileWidth: number,
  tileHeight: number,
  destX: number,
  destY: number
): void {
  for (let row = 0; row < tileHeight; row++) {
    for (let col = 0; col < tileWidth; col++) {
      const srcIdx = row * tileWidth + col;
      const dstIdx = (destY + row) * canvasWidth + (destX + col);
      canvas[dstIdx] = tileHeights[srcIdx];
    }
  }
}

function cropRgba(
  rgba: Buffer,
  width: number,
  height: number,
  crop: { left: number; top: number; width: number; height: number }
): { rgba: Buffer; width: number; height: number } {
  const out = Buffer.alloc(crop.width * crop.height * 4);
  for (let row = 0; row < crop.height; row++) {
    const srcRow = ((crop.top + row) * width + crop.left) * 4;
    const dstRow = row * crop.width * 4;
    rgba.copy(out, dstRow, srcRow, srcRow + crop.width * 4);
  }
  return { rgba: out, width: crop.width, height: crop.height };
}

function cropHeights(
  heights: Float32Array,
  width: number,
  crop: { left: number; top: number; width: number; height: number }
): Float32Array {
  const out = new Float32Array(crop.width * crop.height);
  for (let row = 0; row < crop.height; row++) {
    for (let col = 0; col < crop.width; col++) {
      const srcIdx = (crop.top + row) * width + (crop.left + col);
      const dstIdx = row * crop.width + col;
      out[dstIdx] = heights[srcIdx];
    }
  }
  return out;
}

function minMaxHeights(heights: Float32Array): { minM: number; maxM: number } {
  let minM = Infinity;
  let maxM = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i];
    if (!Number.isFinite(v)) continue;
    if (v < minM) minM = v;
    if (v > maxM) maxM = v;
  }
  if (!Number.isFinite(minM) || !Number.isFinite(maxM)) {
    return { minM: 0, maxM: 0 };
  }
  return { minM, maxM };
}

function sampleBilinear(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const v00 = grid[y0 * width + x0];
  const v10 = grid[y0 * width + x1];
  const v01 = grid[y1 * width + x0];
  const v11 = grid[y1 * width + x1];

  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

/** Upsample elevation grid to match imagery pixel dimensions. */
export function resampleHeightsBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = ((dx + 0.5) * srcW) / dstW - 0.5;
      const sy = ((dy + 0.5) * srcH) / dstH - 0.5;
      dst[dy * dstW + dx] = sampleBilinear(src, srcW, srcH, sx, sy);
    }
  }
  return dst;
}

async function stitchImageryLayer(
  bounds: GeoBounds,
  zoom: number,
  provider: ImageryTileProvider,
  concurrency: number
): Promise<{ imagery: SitePackImagery; tilesFetched: number }> {
  const tiles = tilesForBounds(bounds, zoom);
  if (tiles.length === 0) {
    throw new SiteTerrainError('No imagery tiles for bounds', SiteTerrainErrorCode.INVALID_BOUNDS);
  }

  const extents = tileGridExtents(bounds, zoom);
  const crop = cropRectForBounds(bounds, zoom, extents);
  const imgCanvas = Buffer.alloc(extents.canvasWidth * extents.canvasHeight * 4);

  await mapWithConcurrency(tiles, concurrency, async (tile: TileCoordinate) => {
    const result = await provider.fetchTile(tile);
    const { rgba, width, height } = await decodeImageToRgba(result.data);
    if (width !== TILE_PIXEL_SIZE || height !== TILE_PIXEL_SIZE) {
      throw new SiteTerrainError(
        `Unexpected imagery tile size ${width}x${height}`,
        SiteTerrainErrorCode.DECODE_FAILED
      );
    }
    const destX = (tile.x - extents.minTileX) * TILE_PIXEL_SIZE;
    const destY = (tile.y - extents.minTileY) * TILE_PIXEL_SIZE;
    placeTileRgba(imgCanvas, extents.canvasWidth, rgba, width, height, destX, destY);
  });

  const cropped = cropRgba(imgCanvas, extents.canvasWidth, extents.canvasHeight, crop);
  return {
    imagery: { width: cropped.width, height: cropped.height, rgba: cropped.rgba },
    tilesFetched: tiles.length,
  };
}

async function stitchElevationLayer(
  bounds: GeoBounds,
  zoom: number,
  provider: ElevationTileProvider,
  concurrency: number
): Promise<{ elevation: SitePackElevation; tilesFetched: number }> {
  const tiles = tilesForBounds(bounds, zoom);
  if (tiles.length === 0) {
    throw new SiteTerrainError('No elevation tiles for bounds', SiteTerrainErrorCode.INVALID_BOUNDS);
  }

  const extents = tileGridExtents(bounds, zoom);
  const crop = cropRectForBounds(bounds, zoom, extents);
  const elevCanvas = new Float32Array(extents.canvasWidth * extents.canvasHeight);

  await mapWithConcurrency(tiles, concurrency, async (tile: TileCoordinate) => {
    const result = await provider.fetchTile(tile);
    const { rgba, width, height } = await decodeImageToRgba(result.data);
    if (width !== TILE_PIXEL_SIZE || height !== TILE_PIXEL_SIZE) {
      throw new SiteTerrainError(
        `Unexpected elevation tile size ${width}x${height}`,
        SiteTerrainErrorCode.DECODE_FAILED
      );
    }
    const heights = decodeElevationTile(provider.encoding, rgba, width, height);
    const destX = (tile.x - extents.minTileX) * TILE_PIXEL_SIZE;
    const destY = (tile.y - extents.minTileY) * TILE_PIXEL_SIZE;
    placeTileHeights(elevCanvas, extents.canvasWidth, heights, width, height, destX, destY);
  });

  const croppedHeights = cropHeights(elevCanvas, extents.canvasWidth, crop);
  const { minM, maxM } = minMaxHeights(croppedHeights);

  return {
    elevation: {
      encoding: provider.encoding,
      width: crop.width,
      height: crop.height,
      heights: croppedHeights,
      minM,
      maxM,
    },
    tilesFetched: tiles.length,
  };
}

export async function stitchSiteTerrain(
  input: StitchSiteTerrainInput
): Promise<StitchSiteTerrainResult> {
  const { bounds, imageryZoom, elevationZoom, elevationProvider, imageryProvider } = input;
  const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;

  if (bounds.north <= bounds.south || bounds.east <= bounds.west) {
    throw new SiteTerrainError('Invalid geographic bounds', SiteTerrainErrorCode.INVALID_BOUNDS);
  }

  const [imageryResult, elevationResult] = await Promise.all([
    stitchImageryLayer(bounds, imageryZoom, imageryProvider, concurrency),
    stitchElevationLayer(bounds, elevationZoom, elevationProvider, concurrency),
  ]);

  let elevation = elevationResult.elevation;
  const imagery = imageryResult.imagery;

  if (
    elevation.width !== imagery.width ||
    elevation.height !== imagery.height
  ) {
    const resampled = resampleHeightsBilinear(
      elevation.heights,
      elevation.width,
      elevation.height,
      imagery.width,
      imagery.height
    );
    const { minM, maxM } = minMaxHeights(resampled);
    elevation = {
      ...elevation,
      width: imagery.width,
      height: imagery.height,
      heights: resampled,
      minM,
      maxM,
    };
  }

  return {
    elevation,
    imagery,
    tilesFetched: {
      elevation: elevationResult.tilesFetched,
      imagery: imageryResult.tilesFetched,
    },
  };
}
