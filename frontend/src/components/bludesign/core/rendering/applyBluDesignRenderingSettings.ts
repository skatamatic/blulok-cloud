import * as THREE from 'three';
import type { EditorPreferences } from '../Preferences';

export type BluDesignRenderingSettings = EditorPreferences['rendering'];

export type BluDesignRenderingSettingsPorts = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  getDirectionalLight: () => THREE.DirectionalLight | null | undefined;
  buildingManager: {
    setInstancingEnabled: (enabled: boolean) => void;
    setFrustumCullingEnabled: (enabled: boolean) => void;
  };
  groundTileManager: {
    setInstancingEnabled: (enabled: boolean) => void;
    setFrustumCullingEnabled: (enabled: boolean) => void;
  };
  optimizationManager: {
    setEnabled: (enabled: boolean) => Promise<void>;
    setReadonlyMode: (readonly: boolean) => void;
  };
  readonly: boolean;
  /** Defaults to `window.devicePixelRatio` in browser. */
  getDevicePixelRatio?: () => number;
};

/**
 * Antialiasing: scales renderer pixel ratio when enabled, otherwise 1.
 */
export function applyAntialiasingSettings(
  renderer: Pick<THREE.WebGLRenderer, 'setPixelRatio'>,
  settings: BluDesignRenderingSettings,
  getDevicePixelRatio: () => number
): void {
  if (settings.antialiasingEnabled) {
    renderer.setPixelRatio(
      Math.min(getDevicePixelRatio(), settings.antialiasingLevel || 2)
    );
  } else {
    renderer.setPixelRatio(1);
  }
}

/**
 * Enables or disables shadow map on the WebGL renderer.
 */
export function applyRendererShadowMapEnabled(
  renderer: Pick<THREE.WebGLRenderer, 'shadowMap'>,
  shadowsEnabled: boolean
): void {
  renderer.shadowMap.enabled = shadowsEnabled;
}

/**
 * Configures directional light shadow properties (no-op if light is missing).
 */
export function configureDirectionalLightShadows(
  dirLight: THREE.DirectionalLight | null | undefined,
  settings: BluDesignRenderingSettings
): void {
  if (!dirLight) return;
  dirLight.castShadow = settings.shadowsEnabled;
  if (settings.shadowsEnabled) {
    dirLight.shadow.mapSize.width = settings.shadowMapSize;
    dirLight.shadow.mapSize.height = settings.shadowMapSize;
    dirLight.shadow.camera.far = settings.shadowDistance || 500;
    dirLight.shadow.needsUpdate = true;
  }
}

/**
 * Traverses the scene and updates cast/receive shadow on meshes (matches engine rules).
 */
export function updateMeshShadowFlagsOnScene(
  scene: THREE.Object3D,
  enabled: boolean
): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (
        object.userData.selectable !== false &&
        !object.userData.isGhost &&
        !object.userData.isSelector &&
        !object.userData.isInstanceMarker
      ) {
        object.castShadow = enabled;
        object.receiveShadow = enabled;
      }
    } else if (object instanceof THREE.InstancedMesh) {
      object.castShadow = enabled;
      object.receiveShadow = enabled;
    }
  });
}

export function applyShadowRenderingSettings(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  getDirectionalLight: () => THREE.DirectionalLight | null | undefined,
  settings: BluDesignRenderingSettings
): void {
  applyRendererShadowMapEnabled(renderer, settings.shadowsEnabled);
  configureDirectionalLightShadows(getDirectionalLight(), settings);
  updateMeshShadowFlagsOnScene(scene, settings.shadowsEnabled);
}

export function applyInstancingRenderingSettings(
  buildingManager: BluDesignRenderingSettingsPorts['buildingManager'],
  groundTileManager: BluDesignRenderingSettingsPorts['groundTileManager'],
  instancingEnabled: boolean
): void {
  buildingManager.setInstancingEnabled(instancingEnabled);
  groundTileManager.setInstancingEnabled(instancingEnabled);
}

export async function applyOptimizerRenderingSettings(
  optimizationManager: BluDesignRenderingSettingsPorts['optimizationManager'],
  optimizerEnabled: boolean,
  readonly: boolean
): Promise<void> {
  await optimizationManager.setEnabled(optimizerEnabled);
  optimizationManager.setReadonlyMode(readonly);
}

/**
 * Sets frustum culling on batched instanced meshes and stores flags on managers.
 */
export function updateFrustumCullingOnSceneAndManagers(
  scene: THREE.Scene,
  buildingManager: BluDesignRenderingSettingsPorts['buildingManager'],
  groundTileManager: BluDesignRenderingSettingsPorts['groundTileManager'],
  frustumCullingEnabled: boolean
): void {
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      if (
        object.userData.isBatchedWalls ||
        object.userData.isBatchedRoofTiles ||
        object.userData.isGroundTileBatch ||
        object.userData.isBatchedFloorTiles
      ) {
        object.frustumCulled = frustumCullingEnabled;
      }
    }
  });
  buildingManager.setFrustumCullingEnabled(frustumCullingEnabled);
  groundTileManager.setFrustumCullingEnabled(frustumCullingEnabled);
}

/**
 * Applies all rendering preference fields in dependency order (matches `BluDesignEngine`).
 */
export async function applyBluDesignRenderingSettings(
  ports: BluDesignRenderingSettingsPorts,
  settings: BluDesignRenderingSettings
): Promise<void> {
  const getDpr =
    ports.getDevicePixelRatio ??
    (() => (typeof window !== 'undefined' ? window.devicePixelRatio : 1));

  applyAntialiasingSettings(ports.renderer, settings, getDpr);
  applyShadowRenderingSettings(
    ports.renderer,
    ports.scene,
    ports.getDirectionalLight,
    settings
  );
  applyInstancingRenderingSettings(
    ports.buildingManager,
    ports.groundTileManager,
    settings.instancingEnabled
  );
  await applyOptimizerRenderingSettings(
    ports.optimizationManager,
    settings.optimizerEnabled,
    ports.readonly
  );
  updateFrustumCullingOnSceneAndManagers(
    ports.scene,
    ports.buildingManager,
    ports.groundTileManager,
    settings.frustumCullingEnabled
  );
}
