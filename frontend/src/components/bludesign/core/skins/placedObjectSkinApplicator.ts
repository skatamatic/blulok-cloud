/**
 * Binds {@link CachedTextureLoader} to category-skin application and active theme resolution.
 */

import * as THREE from 'three';
import type { CategorySkin } from '../SkinRegistry';
import { getSkinRegistry } from '../SkinRegistry';
import type { PlacedObject } from '../types';
import { getThemeManager } from '../ThemeManager';
import { applyActiveCategorySkinFromTheme } from './activeThemeSkinApplication';
import { applyCategorySkinToObjectGroup } from './skinMaterialApplicator';

export interface PlacedObjectSkinApplicatorDeps {
  loadTexture: (url: string) => THREE.Texture;
}

export function createPlacedObjectSkinApplicator(deps: PlacedObjectSkinApplicatorDeps) {
  function applySkinToObject(object: THREE.Object3D, skin: CategorySkin): void {
    applyCategorySkinToObjectGroup(object as THREE.Group, skin, {
      loadTexture: deps.loadTexture,
    });
  }

  function applyActiveThemeSkin(
    object: THREE.Object3D,
    objectData?: PlacedObject
  ): void {
    applyActiveCategorySkinFromTheme(
      object,
      objectData,
      getThemeManager().getActiveSkinTheme(),
      (id) => getSkinRegistry().getSkin(id) ?? undefined,
      applySkinToObject
    );
  }

  return { applySkinToObject, applyActiveThemeSkin } as const;
}

export type PlacedObjectSkinApplicator = ReturnType<
  typeof createPlacedObjectSkinApplicator
>;
