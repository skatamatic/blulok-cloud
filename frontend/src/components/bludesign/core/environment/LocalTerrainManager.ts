/**
 * Real satellite terrain mesh for the `local` ground preset.
 */

import * as THREE from 'three';
import {
  createLocalTerrainMaterial,
  applyLocalTerrainUniforms,
  applyLocalTerrainTransform,
  computeLocalTerrainFadeRadii,
  LOCAL_TERRAIN_SEGMENTS,
} from './localTerrainGround';
import {
  resolveEnvironmentOptions,
  type LocalEnvironmentOptions,
  type ScenePresetApplyOptions,
} from './ScenePresets';
import type { TerrainConfig } from './terrainConfigMetadata';

export interface LocalTerrainAssets {
  imageryUrl: string;
  heightmapUrl: string;
  config: TerrainConfig;
}

export class LocalTerrainManager {
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private textureLoader = new THREE.TextureLoader();
  private loadedTextures = new Map<string, THREE.Texture>();
  private lastBounds = new THREE.Box3();
  private lastCenter = new THREE.Vector3();
  private lastFacilityHalf = new THREE.Vector2();
  private lastLocalOptions: LocalEnvironmentOptions = {};
  private activeConfig: TerrainConfig | null = null;

  constructor(private scene: THREE.Scene) {}

  getActiveConfig(): TerrainConfig | null {
    return this.activeConfig;
  }

  async apply(
    bounds: THREE.Box3,
    assets: LocalTerrainAssets,
    options?: ScenePresetApplyOptions
  ): Promise<void> {
    this.activeConfig = assets.config;
    options?.onAssetProgress?.(0);

    const [imageryTex, heightTex] = await Promise.all([
      this.loadTexture(assets.imageryUrl, true),
      this.loadTexture(assets.heightmapUrl, false),
    ]);
    if (!imageryTex || !heightTex) {
      console.warn('[LocalTerrainManager] Failed to load terrain textures', {
        imagery: !!imageryTex,
        heightmap: !!heightTex,
      });
      this.hide();
      options?.onAssetProgress?.(1);
      return;
    }

    heightTex.minFilter = THREE.LinearFilter;
    heightTex.magFilter = THREE.LinearFilter;

    this.ensureMesh();
    if (!this.mesh || !this.material) return;

    this.material.uniforms.uImagery.value = imageryTex;
    this.material.uniforms.uHeightmap.value = heightTex;

    const local = resolveEnvironmentOptions(options?.environmentOptions).local;
    applyLocalTerrainUniforms(this.material, local, assets.config);
    this.positionMesh(bounds, assets.config, options);
    this.mesh.visible = true;
    options?.onAssetProgress?.(1);
  }

  applyLocalOptions(local: LocalEnvironmentOptions, options?: ScenePresetApplyOptions): void {
    if (!this.mesh || !this.material || !this.activeConfig) return;
    applyLocalTerrainUniforms(this.material, local, this.activeConfig);
    if (!this.lastBounds.isEmpty()) {
      this.positionMesh(this.lastBounds, this.activeConfig, {
        ...options,
        environmentOptions: {
          ...options?.environmentOptions,
          local,
        },
      });
    }
  }

  updateTerrainTransform(partial: Partial<TerrainConfig>): void {
    if (!this.activeConfig) return;
    const next = { ...this.activeConfig, ...partial };
    if (partial.offset) {
      next.offset = { ...this.activeConfig.offset, ...partial.offset };
    }
    this.activeConfig = next;

    // Shader-driven properties (elevation displacement, opacity) live in
    // uniforms, not the mesh transform — update them so sliders take effect live.
    if (this.material) {
      const u = this.material.uniforms;
      const elevationScale = this.lastLocalOptions.elevationAmplitudeScale ?? 1;
      u.uElevationAmplitude.value = next.elevationAmplitude * elevationScale;
      u.uBaseOpacity.value = next.baseOpacity;
      u.uHeightMin.value = next.heightMinM;
      u.uHeightMax.value = next.heightMaxM;
    }

    if (this.mesh && !this.lastBounds.isEmpty()) {
      applyLocalTerrainTransform(this.mesh, this.activeConfig, this.lastCenter);
    }
  }

  updateBounds(bounds: THREE.Box3, options?: ScenePresetApplyOptions): void {
    if (!this.mesh || !this.activeConfig) return;
    this.positionMesh(bounds, this.activeConfig, options);
  }

  hide(): void {
    if (this.mesh) this.mesh.visible = false;
  }

  isTerrainVisible(): boolean {
    return Boolean(this.mesh?.visible && this.activeConfig);
  }

  getTerrainMesh(): THREE.Mesh | null {
    return this.mesh?.visible ? this.mesh : null;
  }

  /** World-space bounds including configured elevation relief (shader displacement). */
  getWorldBounds(): THREE.Box3 | null {
    if (!this.mesh?.visible || !this.activeConfig) return null;

    this.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.mesh);
    const relief =
      (this.activeConfig.heightMaxM - this.activeConfig.heightMinM) *
      this.activeConfig.elevationAmplitude *
      (this.lastLocalOptions.elevationAmplitudeScale ?? 1);
    const baseY = this.mesh.position.y;
    box.min.y = baseY;
    box.max.y = baseY + Math.max(relief, 0.5);
    return box;
  }

  update(): void {
    // Static terrain — no per-frame updates required.
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
    this.geometry?.dispose();
    this.geometry = null;
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.loadedTextures.forEach((t) => t.dispose());
    this.loadedTextures.clear();
    this.activeConfig = null;
  }

  private ensureMesh(): void {
    if (this.mesh) return;
    this.geometry = new THREE.PlaneGeometry(1, 1, LOCAL_TERRAIN_SEGMENTS, LOCAL_TERRAIN_SEGMENTS);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = createLocalTerrainMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = -90;
    this.mesh.frustumCulled = false;
    this.mesh.userData.isViewerGroundPlane = true;
    this.scene.add(this.mesh);
  }

  private positionMesh(
    bounds: THREE.Box3,
    config: TerrainConfig,
    options?: ScenePresetApplyOptions
  ): void {
    if (!this.mesh || !this.material) return;

    this.lastBounds.copy(bounds);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    this.lastCenter.copy(center);

    const halfX = Math.max(size.x, 1) / 2;
    const halfZ = Math.max(size.z, 1) / 2;
    const maxHalf = Math.max(halfX, halfZ);
    const maxDim = Math.max(size.x, size.z, 8);

    this.lastFacilityHalf.set(halfX, halfZ);

    const local = resolveEnvironmentOptions(options?.environmentOptions).local;
    this.lastLocalOptions = local;
    const worldSize = config.worldSizeMeters * config.scale;
    const terrainRadius = worldSize * 0.5;
    const { fadeStart, fadeEnd } = computeLocalTerrainFadeRadii({
      maxHalf,
      maxDim,
      terrainRadius,
      fadeStartScale: local.fadeStartScale ?? 1,
      fadeEndScale: local.fadeEndScale ?? 1,
    });

    applyLocalTerrainTransform(this.mesh, config, center);

    const u = this.material.uniforms;
    (u.uFacilityHalf.value as THREE.Vector2).set(halfX, halfZ);
    // Fade + wireframe outskirts radiate from facility content, not terrain tile offset.
    (u.uContentCenter.value as THREE.Vector2).set(center.x, center.z);
    u.uFadeStart.value = fadeStart;
    u.uFadeEnd.value = fadeEnd;
  }

  private loadTextureFromImage(url: string, srgb: boolean): Promise<THREE.Texture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        this.loadedTextures.set(url, tex);
        resolve(tex);
      };
      img.onerror = () => {
        console.warn('[LocalTerrainManager] Image decode failed:', url.slice(0, 48));
        resolve(null);
      };
      img.src = url;
    });
  }

  private loadTexture(url: string, srgb: boolean): Promise<THREE.Texture | null> {
    const cached = this.loadedTextures.get(url);
    if (cached) return Promise.resolve(cached);

    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return this.loadTextureFromImage(url, srgb);
    }

    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          this.loadedTextures.set(url, tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });
  }
}
