/**
 * Resolves active theme skins for a placed object mesh (category → theme skin or default).
 */

import * as THREE from 'three';
import type { Theme } from '../ThemeManager';
import type { CategorySkin } from '../SkinRegistry';
import type { PlacedObject } from '../types';
import { AssetCategory } from '../types';

/**
 * Applies the active theme’s skin for `object`’s category, with default-skin fallback.
 */
export function applyActiveCategorySkinFromTheme(
  object: THREE.Object3D,
  objectData: PlacedObject | undefined,
  theme: Theme,
  getSkin: (skinId: string) => CategorySkin | undefined,
  applySkinToMesh: (object: THREE.Object3D, skin: CategorySkin) => void
): void {
  const group = object as THREE.Group;

  const category = objectData?.assetMetadata?.category || object.userData.category;
  if (!category) {
    return;
  }

  const skinId = theme.categorySkins[category as AssetCategory];

  if (skinId) {
    const skin = getSkin(skinId);
    if (skin) {
      applySkinToMesh(group, skin);
      return;
    }
  }

  const normalizedCategory = String(category).replace(/_/g, '-');
  const defaultSkinId = `skin-${normalizedCategory}-default`;
  const defaultSkin = getSkin(defaultSkinId);
  if (defaultSkin) {
    applySkinToMesh(group, defaultSkin);
  }
}
