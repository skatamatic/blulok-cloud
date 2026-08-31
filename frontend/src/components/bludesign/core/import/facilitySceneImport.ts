import { isLegacyFacilityFormat } from '../serialization/facilityImportHelpers';
import { resolveInitialCameraForImport } from '../camera/cameraStateUtils';
import type {
  AssetSkin,
  BuildingFootprint,
  CameraState,
  SerializedCameraState,
  DataSourceConfig,
  FacilityData,
  GridSize,
  LegacyFacilityData,
  PlacedObject,
  SerializedPlacedObject,
} from '../types';

/**
 * Side-effect hooks for loading facility JSON into the editor.
 * Implemented by `BluDesignEngine` (thin delegation).
 */
export interface FacilitySceneImportServices {
  clearSceneForImport(): void;
  resetWorkingGridAlignment(): void;
  restoreCamera(camera: CameraState | SerializedCameraState): void;
  restoreBuilding(
    id: string,
    footprints: BuildingFootprint[],
    floors: { level: number; height: number }[],
    name?: string
  ): void;
  registerFloorLevel(level: number): void;
  setEditorFloorMode(hasBuildings: boolean): void;
  placeObjectFromSavedData(obj: PlacedObject): void;
  placeObjectFromSerialized(serialized: SerializedPlacedObject): void;
  syncActiveFloor(level: number): void;
  loadLegacyFacilitySkins(skins: AssetSkin[]): void;
  applyActiveSkinsRecord(map: Record<string, string>): void;
  setSnapGridSize(size: GridSize): void;
  optimizeGroundTilesAfterLoad(): void;
  setGridUiVisible(visible: boolean): void;
  /** Resolve theme id (defined); emit UI event if missing */
  resolveAndApplyTheme(activeThemeId: string): void;
  setDataSourceConfig(config: DataSourceConfig | null): void;
  frameImportedLayout?(): void;
  emitImportComplete(): void;
}

/**
 * Apply facility/draft data to the editor (legacy + v2). Ordering matches `BluDesignEngine.importSceneData`.
 */
export function runFacilitySceneImport(
  data: FacilityData | LegacyFacilityData,
  s: FacilitySceneImportServices
): void {
  const isLegacy = isLegacyFacilityFormat(data);

  s.clearSceneForImport();
  s.resetWorkingGridAlignment();

  const initialCamera = resolveInitialCameraForImport(data);
  if (initialCamera) {
    s.restoreCamera(initialCamera);
  }

  if (data.buildings && data.buildings.length > 0) {
    for (const building of data.buildings) {
      s.restoreBuilding(building.id, building.footprints, building.floors, building.name);
      for (const floor of building.floors) {
        s.registerFloorLevel(floor.level);
      }
    }
    s.setEditorFloorMode(true);
  }

  if (data.placedObjects && data.placedObjects.length > 0) {
    if (isLegacy) {
      for (const obj of data.placedObjects as PlacedObject[]) {
        s.placeObjectFromSavedData(obj);
      }
    } else {
      for (const serialized of data.placedObjects as SerializedPlacedObject[]) {
        s.placeObjectFromSerialized(serialized);
      }
    }
  }

  if (data.activeFloor !== undefined) {
    s.syncActiveFloor(data.activeFloor);
  }

  if ('skins' in data && data.skins) {
    s.loadLegacyFacilitySkins(data.skins);
  }
  if ('activeSkins' in data && data.activeSkins) {
    s.applyActiveSkinsRecord(data.activeSkins);
  }

  if (data.gridSize) {
    s.setSnapGridSize(data.gridSize);
  }

  s.optimizeGroundTilesAfterLoad();

  if (data.showGrid !== undefined) {
    s.setGridUiVisible(data.showGrid);
  }

  if ('activeThemeId' in data && data.activeThemeId) {
    s.resolveAndApplyTheme(data.activeThemeId);
  }

  if ('dataSource' in data && data.dataSource) {
    s.setDataSourceConfig(data.dataSource);
  } else {
    s.setDataSourceConfig(null);
  }

  if ('layoutImport' in data && data.layoutImport && !('defaultCamera' in data && data.defaultCamera)) {
    s.frameImportedLayout?.();
  }

  s.emitImportComplete();
}
