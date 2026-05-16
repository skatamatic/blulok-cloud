import * as THREE from 'three';
import type { FacilitySceneImportServices } from '../import/facilitySceneImport';
import { runFacilitySceneImport } from '../import/facilitySceneImport';
import { CameraMode } from '../types';
import type { AssetCategory } from '../types';
import type { DataSourceConfig, EditorState, FacilityData, LegacyFacilityData } from '../types';
import type { CameraController } from '../CameraController';
import type { BuildingManager } from '../BuildingManager';
import type { FloorManager } from '../FloorManager';
import type { GridSystem } from '../GridSystem';
import type { SceneManager } from '../SceneManager';
import type { SkinManager } from '../SkinManager';
import type { PlacedObjectPlacementCoordinator } from '../placement/PlacedObjectPlacementCoordinator';
import { OptimizationManager } from '../OptimizationManager';
import { getThemeManager } from '../ThemeManager';
import {
  placePlacedObjectFromSavedForImport,
  placePlacedObjectFromSerializedForImport,
} from './placeLoadedPlacedObjects';

export type FacilityImportHost = {
  getState: () => EditorState;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  cameraController: CameraController;
  placementCoordinator: PlacedObjectPlacementCoordinator;
  skinManager: SkinManager;
  gridSystem: GridSystem;
  resetWorkingGridAlignment: () => void;
  setDataSourceConfig: (config: DataSourceConfig | null) => void;
  emitStateUpdated: () => void;
  emitThemeMissing: (payload: { missingThemeId: string }) => void;
};

export function createFacilityImportServices(host: FacilityImportHost): FacilitySceneImportServices {
  return {
    clearSceneForImport: () => {
      host.sceneManager.clearObjects();
      host.buildingManager.clear();
    },
    resetWorkingGridAlignment: () => host.resetWorkingGridAlignment(),
    restoreCamera: (camera) => {
      const state = host.getState();
      state.camera = {
        ...state.camera,
        mode: camera.mode,
        isometricAngle: camera.isometricAngle,
        position: new THREE.Vector3(
          camera.position.x,
          camera.position.y,
          camera.position.z
        ),
        target: new THREE.Vector3(camera.target.x, camera.target.y, camera.target.z),
        zoom: camera.zoom,
      };
      host.cameraController.setMode(camera.mode);
      if (camera.mode === CameraMode.ISOMETRIC) {
        host.cameraController.setIsometricAngle(camera.isometricAngle);
      }
    },
    restoreBuilding: (id, footprints, floors, name) => {
      host.buildingManager.restoreBuilding(id, footprints, floors, name);
    },
    registerFloorLevel: (level) => host.floorManager.registerFloor(level),
    setEditorFloorMode: (hasBuildings) => {
      if (hasBuildings) {
        host.getState().isFloorMode = true;
      }
    },
    placeObjectFromSavedData: (obj) =>
      placePlacedObjectFromSavedForImport(obj, host.placementCoordinator),
    placeObjectFromSerialized: (serialized) =>
      placePlacedObjectFromSerializedForImport(serialized, host.placementCoordinator),
    syncActiveFloor: (level) => {
      host.getState().activeFloor = level;
      host.floorManager.setFloor(level);
    },
    loadLegacyFacilitySkins: (skins) => host.skinManager.loadFacilitySkins(skins),
    applyActiveSkinsRecord: (map) => {
      Object.entries(map).forEach(([category, skinId]) => {
        host.skinManager.setActiveSkin(category as AssetCategory, skinId);
      });
    },
    setSnapGridSize: (size) => {
      host.getState().snap.gridSize = size;
    },
    optimizeGroundTilesAfterLoad: () => {
      OptimizationManager.getInstance().optimizeAll(true);
    },
    setGridUiVisible: (visible) => {
      host.getState().ui.showGrid = visible;
      host.gridSystem.setVisible(visible);
    },
    resolveAndApplyTheme: (activeThemeId) => {
      const themeManager = getThemeManager();
      const theme = themeManager.getTheme(activeThemeId);
      if (theme) {
        themeManager.setActiveTheme(activeThemeId);
      } else {
        console.warn(
          `[FacilityImport] Theme not found: ${activeThemeId}, falling back to default`
        );
        themeManager.setActiveTheme('theme-default');
        host.emitThemeMissing({ missingThemeId: activeThemeId });
      }
    },
    setDataSourceConfig: (config) => host.setDataSourceConfig(config),
    emitImportComplete: () => host.emitStateUpdated(),
  };
}

export function importFacilitySceneData(
  data: FacilityData | LegacyFacilityData,
  host: FacilityImportHost
): void {
  runFacilitySceneImport(data, createFacilityImportServices(host));
}
