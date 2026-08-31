/**
 * URL-keyed texture cache for skin materials (reduces duplicate GPU uploads).
 */

import * as THREE from 'three';

export class CachedTextureLoader {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, THREE.Texture>();

  load(url: string): THREE.Texture {
    const existing = this.cache.get(url);
    if (existing) {
      return existing;
    }

    const texture = this.loader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    this.cache.set(url, texture);
    return texture;
  }

  /** For tests / diagnostics */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Dispose cached textures (call when tearing down a WebGL context).
   */
  dispose(): void {
    for (const texture of this.cache.values()) {
      texture.dispose();
    }
    this.cache.clear();
  }
}
