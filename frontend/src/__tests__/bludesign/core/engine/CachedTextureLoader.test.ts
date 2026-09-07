import * as THREE from 'three';
import { CachedTextureLoader } from '../../../../components/bludesign/core/engine/CachedTextureLoader';

describe('CachedTextureLoader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the same texture instance for the same URL', () => {
    const mockTex = { dispose: jest.fn() } as unknown as THREE.Texture;
    const loadSpy = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(mockTex);

    const cache = new CachedTextureLoader();
    const a = cache.load('https://example.com/t.png');
    const b = cache.load('https://example.com/t.png');

    expect(a).toBe(b);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith('https://example.com/t.png');
  });

  it('loads distinct textures for distinct URLs', () => {
    const t1 = { dispose: jest.fn() } as unknown as THREE.Texture;
    const t2 = { dispose: jest.fn() } as unknown as THREE.Texture;
    const loadSpy = jest
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementationOnce(() => t1)
      .mockImplementationOnce(() => t2);

    const cache = new CachedTextureLoader();
    const a = cache.load('https://example.com/a.png');
    const b = cache.load('https://example.com/b.png');

    expect(a).toBe(t1);
    expect(b).toBe(t2);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(cache.getCacheSize()).toBe(2);
  });

  it('configures repeat wrapping and sRGB color space on first load', () => {
    const mockTex = {
      dispose: jest.fn(),
      wrapS: undefined as number | undefined,
      wrapT: undefined as number | undefined,
      colorSpace: undefined as string | undefined,
    } as unknown as THREE.Texture;
    jest.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(mockTex);

    const cache = new CachedTextureLoader();
    cache.load('https://example.com/c.png');

    expect(mockTex.wrapS).toBe(THREE.RepeatWrapping);
    expect(mockTex.wrapT).toBe(THREE.RepeatWrapping);
    expect(mockTex.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('dispose clears cache and disposes textures', () => {
    const mockTex = { dispose: jest.fn() } as unknown as THREE.Texture;
    jest.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(mockTex);

    const cache = new CachedTextureLoader();
    cache.load('https://example.com/a.png');
    expect(cache.getCacheSize()).toBe(1);

    cache.dispose();
    expect(mockTex.dispose).toHaveBeenCalled();
    expect(cache.getCacheSize()).toBe(0);
  });

  it('can load again after dispose (new GPU texture for same URL)', () => {
    const first = { dispose: jest.fn() } as unknown as THREE.Texture;
    const second = { dispose: jest.fn() } as unknown as THREE.Texture;
    jest
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const cache = new CachedTextureLoader();
    expect(cache.load('https://example.com/x.png')).toBe(first);
    cache.dispose();
    expect(cache.load('https://example.com/x.png')).toBe(second);
    expect(THREE.TextureLoader.prototype.load).toHaveBeenCalledTimes(2);
  });
});
