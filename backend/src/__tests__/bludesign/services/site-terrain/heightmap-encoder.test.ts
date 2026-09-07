import { heightsToUint16Buffer, heightsToRg8Buffer, encodeHeightmapPng16 } from '@/bludesign/services/site-terrain/heightmap-encoder';

describe('heightmap-encoder', () => {
  it('maps heights to 16-bit big-endian buffer', () => {
    const heights = new Float32Array([0, 50, 100]);
    const buf = heightsToUint16Buffer(heights, 0, 100);
    expect(buf.length).toBe(6);
    expect(buf.readUInt16BE(0)).toBe(0);
    expect(buf.readUInt16BE(2)).toBe(32768);
    expect(buf.readUInt16BE(4)).toBe(65535);
  });

  it('maps heights to RG8 buffer for browser TextureLoader', () => {
    const heights = new Float32Array([0, 50, 100]);
    const buf = heightsToRg8Buffer(heights, 0, 100);
    expect(buf.length).toBe(6);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(128);
    expect(buf[3]).toBe(0);
    expect(buf[4]).toBe(255);
    expect(buf[5]).toBe(255);
  });

  it('encodes a small heightmap as PNG', async () => {
    const heights = new Float32Array([10, 20, 30, 40]);
    const png = await encodeHeightmapPng16(heights, 2, 2, 0, 100);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.length).toBeGreaterThan(32);
  });
});
