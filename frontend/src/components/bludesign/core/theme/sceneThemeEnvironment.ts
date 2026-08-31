/**
 * Ground mesh + instanced ground-tile materials from theme environment palette.
 */

import * as THREE from 'three';
import type { Theme } from '../ThemeManager';
import { AssetCategory, type PartMaterial } from '../types';

export interface GroundTileMaterialUpdater {
  updateMaterial(category: AssetCategory, partMaterial: PartMaterial): void;
}

export interface SceneThemeEnvironmentPort {
  scene: THREE.Scene;
  groundTileManager: GroundTileMaterialUpdater;
}

/**
 * Updates the infinite ground mesh grass material and pavement/grass/gravel tile materials.
 */
export function applySceneThemeEnvironment(theme: Theme, port: SceneThemeEnvironmentPort): void {
  const ground = port.scene.children.find((c) => c.userData.isGround);
  if (ground && ground instanceof THREE.Mesh) {
    const mat = ground.material as THREE.MeshStandardMaterial;
    if (mat && theme.environment?.grass) {
      mat.color.setStyle(theme.environment.grass.color);
      mat.metalness = theme.environment.grass.metalness;
      mat.roughness = theme.environment.grass.roughness;
      mat.needsUpdate = true;
    }
  }

  if (theme.environment) {
    if (theme.environment.pavement) {
      port.groundTileManager.updateMaterial(AssetCategory.PAVEMENT, theme.environment.pavement);
    }
    if (theme.environment.grass) {
      port.groundTileManager.updateMaterial(AssetCategory.GRASS, theme.environment.grass);
    }
    if (theme.environment.gravel) {
      port.groundTileManager.updateMaterial(AssetCategory.GRAVEL, theme.environment.gravel);
    }
  }
}
