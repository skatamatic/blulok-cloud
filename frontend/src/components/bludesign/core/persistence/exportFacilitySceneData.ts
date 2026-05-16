import type { EditorState } from '../types';
import type {
  Building,
  DataSourceConfig,
  FacilityData,
  PlacedObject,
  SerializedPlacedObject,
} from '../types';
import {
  buildActiveSkinsRecordFromPlacedObjects,
  serializeBuildingForFacility,
  serializePlacedObjectForFacility,
} from '../serialization/facilitySerialization';
import { getThemeManager } from '../ThemeManager';

export type ExportFacilitySceneDataInput = {
  placedObjects: PlacedObject[];
  state: EditorState;
  buildings: Building[];
  dataSourceConfig: DataSourceConfig | null;
};

/**
 * Builds the v2 facility payload for save (camera rounding, skins, theme id).
 */
export function exportFacilitySceneData(input: ExportFacilitySceneDataInput): FacilityData {
  const serializedObjects: SerializedPlacedObject[] = input.placedObjects.map((obj) =>
    serializePlacedObjectForFacility(obj)
  );

  const camera = {
    mode: input.state.camera.mode,
    isometricAngle: input.state.camera.isometricAngle,
    position: {
      x: Math.round(input.state.camera.position.x * 100) / 100,
      y: Math.round(input.state.camera.position.y * 100) / 100,
      z: Math.round(input.state.camera.position.z * 100) / 100,
    },
    target: {
      x: Math.round(input.state.camera.target.x * 100) / 100,
      y: Math.round(input.state.camera.target.y * 100) / 100,
      z: Math.round(input.state.camera.target.z * 100) / 100,
    },
    zoom: Math.round(input.state.camera.zoom * 100) / 100,
  };

  const activeSkins = buildActiveSkinsRecordFromPlacedObjects(input.placedObjects);
  const activeThemeId = getThemeManager().getActiveThemeId();
  const serializedBuildings = input.buildings.map((b) => serializeBuildingForFacility(b));

  return {
    name: '',
    version: '2.0.0',
    camera: camera as FacilityData['camera'],
    placedObjects: serializedObjects,
    buildings: serializedBuildings,
    activeFloor: input.state.activeFloor,
    activeSkins,
    activeThemeId,
    gridSize: input.state.snap.gridSize,
    showGrid: input.state.ui.showGrid,
    dataSource: input.dataSourceConfig || undefined,
  };
}
