/**
 * Full editor scene pass: building materials, placed-object skins, ground/environment.
 */

import * as THREE from 'three';
import type { Theme } from '../ThemeManager';
import type { CategorySkin } from '../SkinRegistry';
import type { BuildingMaterials, PlacedObject } from '../types';
import { BuildingSkinType } from '../types';
import type { GroundTileMaterialUpdater } from './sceneThemeEnvironment';
import {
  getBuildingMaterialsFromTheme,
  isGlassBuildingSkinId,
} from './buildingMaterialsFromTheme';
import { applyThemeToPlacedSceneObjects } from './sceneThemePlacedObjects';
import { applySceneThemeEnvironment } from './sceneThemeEnvironment';

export interface ApplyFullBluDesignSceneThemeDeps {
  getSkin: (skinId: string) => CategorySkin | undefined;
  buildingManager: {
    applyBuildingMaterials(
      materials: BuildingMaterials,
      isGlassTheme?: boolean
    ): void;
  };
  sceneManager: {
    getAllObjects(): Iterable<[string, THREE.Object3D]>;
    getObjectData(id: string): PlacedObject | undefined;
  };
  groundTileManager: GroundTileMaterialUpdater;
  scene: THREE.Scene;
  isFloorMode: boolean;
  floorManager: { applyGhosting(): void };
  applySkinToObject(object: THREE.Object3D, skin: CategorySkin): void;
}

export function applyFullBluDesignSceneTheme(
  theme: Theme,
  deps: ApplyFullBluDesignSceneThemeDeps
): void {
  const getSkin = deps.getSkin;
  const buildingMaterials = getBuildingMaterialsFromTheme(theme, getSkin);
  const isGlassTheme =
    theme.buildingSkin === BuildingSkinType.GLASS ||
    (theme.buildingSkinId
      ? isGlassBuildingSkinId(theme.buildingSkinId, getSkin)
      : false);

  deps.buildingManager.applyBuildingMaterials(buildingMaterials, isGlassTheme);

  applyThemeToPlacedSceneObjects(theme, {
    getAllObjectEntries: () => deps.sceneManager.getAllObjects(),
    getObjectData: (id) => deps.sceneManager.getObjectData(id),
    getSkin,
    applySkinToObject: deps.applySkinToObject,
  });

  applySceneThemeEnvironment(theme, {
    scene: deps.scene,
    groundTileManager: deps.groundTileManager,
  });

  if (deps.isFloorMode) {
    deps.floorManager.applyGhosting();
  }
}
