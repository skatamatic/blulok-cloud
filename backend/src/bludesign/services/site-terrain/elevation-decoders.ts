/**
 * Decode elevation from RGB-encoded terrain tiles.
 */

import type { ElevationEncoding } from './types';

/** Mapzen Terrarium: (R * 256 + G + B / 256) - 32768 meters */
export function decodeTerrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Mapbox Terrain-RGB: -10000 + ((R*256² + G*256 + B) * 0.1) meters */
export function decodeMapboxRgbHeight(r: number, g: number, b: number): number {
  return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
}

export function decodeElevationPixel(
  encoding: ElevationEncoding,
  r: number,
  g: number,
  b: number
): number {
  switch (encoding) {
    case 'terrarium':
      return decodeTerrariumHeight(r, g, b);
    case 'mapbox-rgb':
      return decodeMapboxRgbHeight(r, g, b);
    default:
      throw new Error(`Unknown elevation encoding: ${encoding}`);
  }
}

/** Decode a row-major RGBA buffer (256×256 tile) into height values. */
export function decodeElevationTile(
  encoding: ElevationEncoding,
  rgba: Buffer,
  width: number,
  height: number
): Float32Array {
  const count = width * height;
  const heights = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    heights[i] = decodeElevationPixel(encoding, rgba[offset], rgba[offset + 1], rgba[offset + 2]);
  }

  return heights;
}
