/**
 * Sky preset manager — procedural Sky, solid colors, and HDR environments.
 */

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  NIGHT_SKY_COLOR,
  SKY_PRESET_ASSETS,
  SkyPresetId,
  THEME_BACKGROUND_COLORS,
  type ScenePresetApplyOptions,
} from './ScenePresets';

export type SkyTheme = 'light' | 'dark';

export interface SkyManagerOptions {
  scene: THREE.Scene;
  getRenderer: () => THREE.WebGLRenderer;
}

export class SkyManager {
  private scene: THREE.Scene;
  private getRenderer: () => THREE.WebGLRenderer;
  private skyMesh: Sky | null = null;
  private hdrPmrem: THREE.Texture | null = null;
  private activePreset: SkyPresetId = 'blank';
  private activeTheme: SkyTheme = 'dark';
  private hdrLoadPromise: Promise<void> | null = null;

  constructor(options: SkyManagerOptions) {
    this.scene = options.scene;
    this.getRenderer = options.getRenderer;
  }

  getActivePreset(): SkyPresetId {
    return this.activePreset;
  }

  setTheme(theme: SkyTheme): void {
    this.activeTheme = theme;
    if (this.activePreset === 'blank') {
      this.applySolidBackground(THEME_BACKGROUND_COLORS[theme]);
    }
  }

  async applyPreset(preset: SkyPresetId, options?: ScenePresetApplyOptions): Promise<void> {
    this.activePreset = preset;
    this.clearSkyMesh();

    if (preset !== 'natural') {
      this.clearHdrEnvironment();
    }

    switch (preset) {
      case 'blank':
        options?.onAssetProgress?.(1);
        this.applySolidBackground(THEME_BACKGROUND_COLORS[this.activeTheme]);
        break;
      case 'night':
        options?.onAssetProgress?.(1);
        this.applySolidBackground(NIGHT_SKY_COLOR);
        break;
      case 'day':
        options?.onAssetProgress?.(1);
        this.applyProceduralSky({ elevation: 55, azimuth: 180 });
        break;
      case 'sunset':
        options?.onAssetProgress?.(1);
        this.applyProceduralSky({ elevation: 4, azimuth: 200 });
        break;
      case 'natural':
        await this.applyHdrSky(options);
        break;
      default:
        options?.onAssetProgress?.(1);
        this.applySolidBackground(THEME_BACKGROUND_COLORS[this.activeTheme]);
    }
  }

  private applySolidBackground(hex: string): void {
    this.scene.background = new THREE.Color(hex);
  }

  private applyProceduralSky(sun: { elevation: number; azimuth: number }): void {
    const sky = new Sky();
    sky.scale.setScalar(450000);
    this.scene.add(sky);
    this.skyMesh = sky;

    const sunPosition = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - sun.elevation);
    const theta = THREE.MathUtils.degToRad(sun.azimuth);
    sunPosition.setFromSphericalCoords(1, phi, theta);

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = sun.elevation < 10 ? 8 : 4;
    uniforms['rayleigh'].value = 2;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;
    uniforms['sunPosition'].value.copy(sunPosition);

    this.scene.background = null;
  }

  private async applyHdrSky(options?: ScenePresetApplyOptions): Promise<void> {
    if (!this.hdrPmrem) {
      options?.onAssetProgress?.(0);
      this.hdrLoadPromise = null;
      this.hdrLoadPromise = this.loadHdrEnvironment(options?.onAssetProgress);
      await this.hdrLoadPromise;
    } else {
      options?.onAssetProgress?.(1);
    }

    if (this.activePreset !== 'natural') return;
    if (this.hdrPmrem) {
      this.scene.background = this.hdrPmrem;
      this.scene.environment = this.hdrPmrem;
    }
  }

  private loadHdrEnvironment(onAssetProgress?: (ratio: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const loader = new RGBELoader();
      loader.load(
        SKY_PRESET_ASSETS.naturalHdr,
        (texture) => {
          onAssetProgress?.(0.92);
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const renderer = this.getRenderer();
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const envTexture = pmrem.fromEquirectangular(texture).texture;
          texture.dispose();
          pmrem.dispose();

          if (this.activePreset !== 'natural') {
            envTexture.dispose();
            resolve();
            return;
          }

          this.hdrPmrem = envTexture;
          onAssetProgress?.(1);
          resolve();
        },
        (event) => {
          if (event.total > 0) {
            // Reserve the last ~8% for PMREM generation after download completes.
            onAssetProgress?.(Math.min(0.9, (event.loaded / event.total) * 0.9));
          }
        },
        (err) => {
          console.warn('[SkyManager] HDR load failed, falling back to blank sky:', err);
          this.activePreset = 'blank';
          this.hdrLoadPromise = null;
          this.hdrPmrem = null;
          this.applySolidBackground(THEME_BACKGROUND_COLORS[this.activeTheme]);
          resolve();
        }
      );
    });
  }

  private clearSkyMesh(): void {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.skyMesh = null;
    }
  }

  private clearHdrEnvironment(): void {
    if (this.hdrPmrem) {
      if (this.scene.background === this.hdrPmrem) {
        this.scene.background = null;
      }
      if (this.scene.environment === this.hdrPmrem) {
        this.scene.environment = null;
      }
      this.hdrPmrem.dispose();
      this.hdrPmrem = null;
    }
  }

  dispose(): void {
    this.clearSkyMesh();
    this.clearHdrEnvironment();
    this.hdrLoadPromise = null;
  }
}
