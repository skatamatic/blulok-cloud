import type { LayoutImportMetadata } from '../../layout-import/layoutImportMetadata';
import { attachLayoutImportToFacilityData } from '../../layout-import/layoutImportMetadata';
import type { EditorState, SerializedCameraState } from '../types';
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
import { serializeCameraState } from '../camera/cameraStateUtils';
import { getThemeManager } from '../ThemeManager';

export type ExportFacilitySceneDataInput = {
  placedObjects: PlacedObject[];
  state: EditorState;
  buildings: Building[];
  dataSourceConfig: DataSourceConfig | null;
  layoutImport?: LayoutImportMetadata | null;
  defaultCamera?: SerializedCameraState | null;
};

/**
 * Builds the v2 facility payload for save (camera rounding, skins, theme id).
 */
export function exportFacilitySceneData(input: ExportFacilitySceneDataInput): FacilityData {
  const serializedObjects: SerializedPlacedObject[] = input.placedObjects.map((obj) =>
    serializePlacedObjectForFacility(obj)
  );

  const camera = serializeCameraState(input.state.camera);

  const activeSkins = buildActiveSkinsRecordFromPlacedObjects(input.placedObjects);
  const activeThemeId = getThemeManager().getActiveThemeId();
  const serializedBuildings = input.buildings.map((b) => serializeBuildingForFacility(b));

  const base: FacilityData = {
    name: '',
    version: '2.0.0',
    camera,
    ...(input.defaultCamera ? { defaultCamera: input.defaultCamera } : {}),
    placedObjects: serializedObjects,
    buildings: serializedBuildings,
    activeFloor: input.state.activeFloor,
    activeSkins,
    activeThemeId,
    gridSize: input.state.snap.gridSize,
    showGrid: input.state.ui.showGrid,
    dataSource: input.dataSourceConfig || undefined,
  };

  return attachLayoutImportToFacilityData(base, input.layoutImport);
}
