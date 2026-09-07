import {
  decodeElevationPixel,
  decodeElevationTile,
  decodeMapboxRgbHeight,
  decodeTerrariumHeight,
} from '@/bludesign/services/site-terrain/elevation-decoders';

describe('elevation-decoders', () => {
  it('decodes Terrarium sea level at R=128,G=0,B=0', () => {
    expect(decodeTerrariumHeight(128, 0, 0)).toBeCloseTo(0, 1);
  });

  it('decodes Terrarium via encoding dispatch', () => {
    expect(decodeElevationPixel('terrarium', 128, 0, 0)).toBeCloseTo(0, 1);
  });

  it('decodes Mapbox RGB zero to -10000m', () => {
    expect(decodeMapboxRgbHeight(0, 0, 0)).toBe(-10000);
    expect(decodeElevationPixel('mapbox-rgb', 0, 0, 0)).toBe(-10000);
  });

  it('decodes a full tile buffer', () => {
    const rgba = Buffer.alloc(256 * 256 * 4);
    for (let i = 0; i < 256 * 256; i++) {
      const o = i * 4;
      rgba[o] = 128;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255;
    }
    const heights = decodeElevationTile('terrarium', rgba, 256, 256);
    expect(heights.length).toBe(256 * 256);
    expect(heights[0]).toBeCloseTo(0, 1);
    expect(heights[heights.length - 1]).toBeCloseTo(0, 1);
  });
});
