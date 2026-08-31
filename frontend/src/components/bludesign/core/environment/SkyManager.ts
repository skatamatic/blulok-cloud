/**
 * Sky preset manager — procedural Sky, solid colors, and HDR environments.
 */

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import {
  NIGHT_SKY_COLOR,
  SKY_PRESET_ASSETS,
  SkyPresetId,
  THEME_BACKGROUND_COLORS,
  resolveEnvironmentOptions,
  type ScenePresetApplyOptions,
} from './ScenePresets';

export type SkyTheme = 'light' | 'dark';

/** Sky presets that load an equirectangular HDR for background + IBL. */
type HdrSkyPresetId = 'natural' | 'space';

/** Space visuals use a separate daylight HDR for material lighting (IBL). */
const SPACE_LIGHTING_PRESET: HdrSkyPresetId = 'natural';

const HDR_SKY_ASSETS: Record<HdrSkyPresetId, string> = {
  natural: SKY_PRESET_ASSETS.naturalHdr,
  space: SKY_PRESET_ASSETS.spaceHdr,
};

export interface SkyManagerOptions {
  scene: THREE.Scene;
  getRenderer: () => THREE.WebGLRenderer;
}

export class SkyManager {
  private scene: THREE.Scene;
  private getRenderer: () => THREE.WebGLRenderer;
  private skyMesh: Sky | null = null;
  private hdrPmremCache = new Map<HdrSkyPresetId, THREE.Texture>();
  private hdrLoadPromises = new Map<HdrSkyPresetId, Promise<void>>();
  private activePreset: SkyPresetId = 'blank';
  private activeTheme: SkyTheme = 'dark';
  /** Techno ground can overlay the space HDR without switching the sky preset. */
  private spaceBackdropOverlayActive = false;

  constructor(options: SkyManagerOptions) {
    this.scene = options.scene;
    this.getRenderer = options.getRenderer;
  }

  getActivePreset(): SkyPresetId {
    return this.activePreset;
  }

  isSpaceBackdropOverlayActive(): boolean {
    return this.spaceBackdropOverlayActive;
  }

  /** True when space HDR is visible but daylight HDR drives IBL. */
  usesSplitSpaceLighting(): boolean {
    return this.activePreset === 'space' || this.spaceBackdropOverlayActive;
  }

  /**
   * Overlay the space starfield HDR as the scene background (techno ground preset).
   * Material lighting uses the daylight `natural` HDR for IBL.
   */
  async setSpaceBackdropOverlay(
    enabled: boolean,
    options?: ScenePresetApplyOptions
  ): Promise<void> {
    if (!enabled && !this.spaceBackdropOverlayActive) {
      return;
    }

    if (enabled) {
      const skyOptions = resolveEnvironmentOptions(options?.environmentOptions).sky;
      if (this.spaceBackdropOverlayActive && this.hdrPmremCache.has('space')) {
        await this.ensureHdrLoaded(SPACE_LIGHTING_PRESET, options?.onAssetProgress);
        this.attachSpaceWithDaylightLighting(skyOptions, {
          defaultExposure: 1,
          defaultBackgroundIntensity: 0.95,
        });
        return;
      }
      this.spaceBackdropOverlayActive = true;
      this.clearSkyMesh();
      await this.ensureSpaceWithDaylightLighting(options?.onAssetProgress);
      if (!this.spaceBackdropOverlayActive) return;
      if (!this.hdrPmremCache.has('space')) {
        this.spaceBackdropOverlayActive = false;
        await this.applyPreset(this.activePreset, options);
        return;
      }
      this.attachSpaceWithDaylightLighting(skyOptions, {
        defaultExposure: 1,
        defaultBackgroundIntensity: 0.95,
      });
      return;
    }

    if (!this.spaceBackdropOverlayActive) return;
    this.spaceBackdropOverlayActive = false;
    await this.applyPreset(this.activePreset, options);
  }

  setTheme(theme: SkyTheme): void {
    this.activeTheme = theme;
    if (this.activePreset === 'blank' && !this.spaceBackdropOverlayActive) {
      this.applySolidBackground(THEME_BACKGROUND_COLORS[theme]);
    }
  }

  async applyPreset(preset: SkyPresetId, options?: ScenePresetApplyOptions): Promise<void> {
    this.activePreset = preset;
    if (!this.spaceBackdropOverlayActive) {
      this.clearSkyMesh();
    }

    if (!this.isHdrPreset(preset) && !this.spaceBackdropOverlayActive) {
      this.detachHdrFromScene();
    }

    if (this.spaceBackdropOverlayActive) {
      options?.onAssetProgress?.(1);
      return;
    }

    const skyOptions = resolveEnvironmentOptions(options?.environmentOptions).sky;

    switch (preset) {
      case 'blank':
        options?.onAssetProgress?.(1);
        this.applySolidBackground(
          skyOptions.backgroundTint ?? THEME_BACKGROUND_COLORS[this.activeTheme]
        );
        break;
      case 'night':
        options?.onAssetProgress?.(1);
        this.applySolidBackground(skyOptions.backgroundTint ?? NIGHT_SKY_COLOR);
        break;
      case 'day':
        options?.onAssetProgress?.(1);
        this.applyProceduralSky(
          {
            elevation: skyOptions.sunElevation ?? 55,
            azimuth: skyOptions.sunAzimuth ?? 180,
          },
          skyOptions
        );
        break;
      case 'sunset':
        options?.onAssetProgress?.(1);
        this.applyProceduralSky(
          {
            elevation: skyOptions.sunElevation ?? 4,
            azimuth: skyOptions.sunAzimuth ?? 200,
          },
          skyOptions,
          { defaultTurbidity: 8 }
        );
        break;
      case 'natural':
        await this.applyHdrSky('natural', options, skyOptions);
        break;
      case 'space':
        await this.applyHdrSky('space', options, skyOptions, {
          defaultExposure: 1,
          defaultBackgroundIntensity: 0.95,
        });
        break;
      default:
        options?.onAssetProgress?.(1);
        this.applySolidBackground(THEME_BACKGROUND_COLORS[this.activeTheme]);
    }
  }

  private async ensureHdrLoaded(
    preset: HdrSkyPresetId,
    onAssetProgress?: (ratio: number) => void
  ): Promise<void> {
    if (this.hdrPmremCache.has(preset)) {
      onAssetProgress?.(1);
      return;
    }
    onAssetProgress?.(0);
    let loadPromise = this.hdrLoadPromises.get(preset);
    if (!loadPromise) {
      loadPromise = this.loadHdrEnvironment(preset, onAssetProgress);
      this.hdrLoadPromises.set(preset, loadPromise);
    }
    await loadPromise;
  }

  /** Load space backdrop + daylight IBL HDRs (reports blended progress). */
  private async ensureSpaceWithDaylightLighting(
    onAssetProgress?: (ratio: number) => void
  ): Promise<void> {
    await this.ensureHdrLoaded('space', (ratio) => onAssetProgress?.(ratio * 0.55));
    await this.ensureHdrLoaded(SPACE_LIGHTING_PRESET, (ratio) =>
      onAssetProgress?.(0.55 + ratio * 0.45)
    );
  }

  private resetHdrIntensity(): void {
    this.scene.backgroundIntensity = 1;
    this.scene.environmentIntensity = 1;
  }

  private attachHdrToScene(
    preset: HdrSkyPresetId,
    skyOptions: ReturnType<typeof resolveEnvironmentOptions>['sky'],
    defaults?: { defaultExposure?: number; defaultBackgroundIntensity?: number }
  ): void {
    const envTexture = this.hdrPmremCache.get(preset);
    if (!envTexture) return;
    this.scene.background = envTexture;
    this.scene.environment = envTexture;
    this.resetHdrIntensity();
    const renderer = this.getRenderer();
    const exposure = skyOptions.exposure ?? defaults?.defaultExposure ?? 1;
    const backgroundIntensity =
      skyOptions.backgroundIntensity ?? defaults?.defaultBackgroundIntensity ?? 1;
    renderer.toneMappingExposure = exposure * backgroundIntensity;
  }

  /** Space starfield background + daylight natural HDR for facility IBL. */
  private attachSpaceWithDaylightLighting(
    skyOptions: ReturnType<typeof resolveEnvironmentOptions>['sky'],
    defaults?: { defaultExposure?: number; defaultBackgroundIntensity?: number }
  ): void {
    const spaceTexture = this.hdrPmremCache.get('space');
    if (!spaceTexture) return;

    const lightingTexture =
      this.hdrPmremCache.get(SPACE_LIGHTING_PRESET) ?? spaceTexture;

    this.scene.background = spaceTexture;
    this.scene.environment = lightingTexture;

    const backgroundIntensity =
      skyOptions.backgroundIntensity ?? defaults?.defaultBackgroundIntensity ?? 0.95;
    const lightingIntensity = skyOptions.exposure ?? defaults?.defaultExposure ?? 1;

    this.scene.backgroundIntensity = backgroundIntensity;
    this.scene.environmentIntensity = lightingIntensity;
    this.getRenderer().toneMappingExposure = 1;
  }

  private async applyHdrSky(
    preset: HdrSkyPresetId,
    options?: ScenePresetApplyOptions,
    skyOptions?: ReturnType<typeof resolveEnvironmentOptions>['sky'],
    defaults?: { defaultExposure?: number; defaultBackgroundIntensity?: number }
  ): Promise<void> {
    const resolvedSkyOptions = skyOptions ?? resolveEnvironmentOptions(options?.environmentOptions).sky;

    if (preset === 'space') {
      await this.ensureSpaceWithDaylightLighting(options?.onAssetProgress);
      if (this.activePreset !== preset || this.spaceBackdropOverlayActive) return;
      this.attachSpaceWithDaylightLighting(resolvedSkyOptions, defaults);
      return;
    }

    await this.ensureHdrLoaded(preset, options?.onAssetProgress);

    if (this.activePreset !== preset || this.spaceBackdropOverlayActive) return;

    this.attachHdrToScene(preset, resolvedSkyOptions, defaults);
  }

  private loadHdrEnvironment(
    preset: HdrSkyPresetId,
    onAssetProgress?: (ratio: number) => void
  ): Promise<void> {
    const url = HDR_SKY_ASSETS[preset];
    const isExr = url.endsWith('.exr');

    return new Promise((resolve) => {
      const onLoad = (texture: THREE.DataTexture) => {
        onAssetProgress?.(0.92);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const renderer = this.getRenderer();
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const envTexture = pmrem.fromEquirectangular(texture).texture;
        texture.dispose();
        pmrem.dispose();

        this.hdrPmremCache.set(preset, envTexture);
        this.hdrLoadPromises.delete(preset);
        onAssetProgress?.(1);
        resolve();
      };

      const onProgress = (event: ProgressEvent<EventTarget>) => {
        if (event.lengthComputable && event.total > 0) {
          onAssetProgress?.(Math.min(0.9, (event.loaded / event.total) * 0.9));
        }
      };

      const onError = (err: unknown) => {
        console.warn(`[SkyManager] Environment load failed for "${preset}":`, err);
        this.hdrLoadPromises.delete(preset);
        resolve();
      };

      if (isExr) {
        new EXRLoader().load(url, onLoad, onProgress, onError);
      } else {
        new RGBELoader().load(url, onLoad, onProgress, onError);
      }
    });
  }

  private isHdrPreset(preset: SkyPresetId): preset is HdrSkyPresetId {
    return preset === 'natural' || preset === 'space';
  }

  private applySolidBackground(hex: string): void {
    this.scene.background = new THREE.Color(hex);
    this.resetHdrIntensity();
  }

  private applyProceduralSky(
    sun: { elevation: number; azimuth: number },
    skyOptions: ReturnType<typeof resolveEnvironmentOptions>['sky'],
    config?: { defaultTurbidity?: number }
  ): void {
    const sky = new Sky();
    sky.scale.setScalar(450000);
    this.scene.add(sky);
    this.skyMesh = sky;

    const sunPosition = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - sun.elevation);
    const theta = THREE.MathUtils.degToRad(sun.azimuth);
    sunPosition.setFromSphericalCoords(1, phi, theta);

    const uniforms = sky.material.uniforms;
    const defaultTurbidity = config?.defaultTurbidity ?? 4;
    uniforms['turbidity'].value =
      skyOptions.turbidity ?? (sun.elevation < 10 ? 8 : defaultTurbidity);
    uniforms['rayleigh'].value = skyOptions.atmosphereIntensity ?? 2;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;
    uniforms['sunPosition'].value.copy(sunPosition);

    this.scene.background = null;
    this.resetHdrIntensity();
  }

  private detachHdrFromScene(): void {
    for (const texture of this.hdrPmremCache.values()) {
      if (this.scene.background === texture) {
        this.scene.background = null;
      }
      if (this.scene.environment === texture) {
        this.scene.environment = null;
      }
    }
    this.resetHdrIntensity();
  }

  private clearSkyMesh(): void {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.skyMesh = null;
    }
  }

  dispose(): void {
    this.spaceBackdropOverlayActive = false;
    this.clearSkyMesh();
    this.detachHdrFromScene();
    for (const texture of this.hdrPmremCache.values()) {
      texture.dispose();
    }
    this.hdrPmremCache.clear();
    this.hdrLoadPromises.clear();
  }
}
