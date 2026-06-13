/**
 * Image decoding: raster buffer (PNG/JPG/WEBP) → raw RGBA pixels.
 *
 * We use `sharp` to decode because it ships prebuilt native binaries (works on
 * Windows dev + Linux Docker/Cloud Run prod without node-gyp) and produces the
 * tightly-packed RGBA buffer OpenCV's `cv.matFromImageData` expects.
 */

import sharp from 'sharp';

/**
 * Decoded image in raw RGBA form, shaped like the browser `ImageData` object
 * that `cv.matFromImageData` consumes.
 */
export interface DecodedImage {
  /** Packed RGBA pixel data, length === width * height * 4. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Decode an encoded image buffer into raw RGBA pixels.
 *
 * @throws if the buffer is not a decodable raster image.
 */
export async function decodeImage(buffer: Buffer): Promise<DecodedImage> {
  if (!buffer || buffer.length === 0) {
    throw new Error('decodeImage: empty image buffer');
  }

  // `ensureAlpha` guarantees 4 channels even for opaque PNG/JPG sources so the
  // stride is always width*4 and OpenCV reads it as RGBA.
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(
      `decodeImage: expected 4 channels after ensureAlpha, got ${channels}`
    );
  }

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width,
    height,
  };
}
