/**
 * Encode elevation grids as PNG heightmaps for mesh displacement.
 * Pixels are RG8: height = (R*256 + G) / 65535 → mix(minM, maxM, height).
 * Browsers decode this reliably via TextureLoader (unlike 16-bit grayscale PNG).
 */

import sharp from 'sharp';

export function heightsToUint16Buffer(
  heights: Float32Array,
  minM: number,
  maxM: number
): Buffer {
  const range = maxM - minM || 1;
  const out = Buffer.alloc(heights.length * 2);
  for (let i = 0; i < heights.length; i++) {
    const t = Math.max(0, Math.min(1, (heights[i] - minM) / range));
    const v = Math.round(t * 65535);
    out.writeUInt16BE(v, i * 2);
  }
  return out;
}

/** RG8 raw buffer: R = high byte, G = low byte of normalized elevation. */
export function heightsToRg8Buffer(
  heights: Float32Array,
  minM: number,
  maxM: number
): Buffer {
  const range = maxM - minM || 1;
  const out = Buffer.alloc(heights.length * 2);
  for (let i = 0; i < heights.length; i++) {
    const t = Math.max(0, Math.min(1, (heights[i] - minM) / range));
    const v = Math.round(t * 65535);
    out[i * 2] = (v >> 8) & 0xff;
    out[i * 2 + 1] = v & 0xff;
  }
  return out;
}

export async function encodeHeightmapPng16(
  heights: Float32Array,
  width: number,
  height: number,
  minM: number,
  maxM: number
): Promise<Buffer> {
  const raw = heightsToRg8Buffer(heights, minM, maxM);
  return sharp(raw, {
    raw: { width, height, channels: 2 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function encodeImageryJpeg(
  rgba: Buffer,
  width: number,
  height: number,
  quality = 90
): Promise<Buffer> {
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .jpeg({ quality })
    .toBuffer();
}
