/**
 * Applies a {@link Theme} to all placed meshes (per-object skin overrides and category skins).
 */

import * as THREE from 'three';
import type { Theme } from '../ThemeManager';
import type { CategorySkin } from '../SkinRegistry';
import type { PlacedObject } from '../types';
import { AssetCategory } from '../types';

export interface SceneThemePlacedObjectsPort {
  getAllObjectEntries(): Iterable<[string, THREE.Object3D]>;
  getObjectData(id: string): PlacedObject | undefined;
  getSkin(skinId: string): CategorySkin | undefined;
  applySkinToObject(object: THREE.Object3D, skin: CategorySkin): void;
}

/**
 * Walks scene objects and applies `theme` skins (respecting per-object `skinId` overrides).
 */
export function applyThemeToPlacedSceneObjects(theme: Theme, port: SceneThemePlacedObjectsPort): void {
  for (const [id, object] of port.getAllObjectEntries()) {
    if (object.userData.isGrid || object.userData.isGround) {
      continue;
    }

    const objectData = port.getObjectData(id);
    const category = objectData?.assetMetadata?.category || object.userData.category;

    if ((object.userData.assetId || objectData) && category) {
      if (objectData?.skinId) {
        const skin = port.getSkin(objectData.skinId);
        if (skin) {
          port.applySkinToObject(object as THREE.Group, skin);
        } else {
          const skinId = theme.categorySkins[category as AssetCategory];
          if (skinId) {
            const fallbackSkin = port.getSkin(skinId);
            if (fallbackSkin) {
              port.applySkinToObject(object as THREE.Group, fallbackSkin);
            }
          }
        }
      } else {
        const skinId = theme.categorySkins[category as AssetCategory];
        if (skinId) {
          const skin = port.getSkin(skinId);
          if (skin) {
            port.applySkinToObject(object as THREE.Group, skin);
          }
        } else {
          const normalizedCategory = String(category).replace(/_/g, '-');
          const defaultSkinId = `skin-${normalizedCategory}-default`;
          const defaultSkin = port.getSkin(defaultSkinId);
          if (defaultSkin) {
            port.applySkinToObject(object as THREE.Group, defaultSkin);
          }
        }
      }
    }
  }
}
