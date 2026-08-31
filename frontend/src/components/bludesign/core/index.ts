/**
 * BluDesign Core Module Exports
 */

export * from './types';
export { BluDesignEngine } from './BluDesignEngine';
export type { BluDesignEngineOptions } from './BluDesignEngine';
export { SceneManager } from './SceneManager';
export { CameraController } from './CameraController';
export { GridSystem } from './GridSystem';
export { SelectionManager } from './SelectionManager';
export { PlacementManager } from './PlacementManager';
export { TranslateGizmo } from './TranslateGizmo';
export type { GizmoAxis } from './TranslateGizmo';
export { InputCoordinator, InputPriority } from './InputCoordinator';
export type { InputHandler, InputEventType } from './InputCoordinator';
export { OptimizationManager } from './OptimizationManager';
export type { OptimizationStats } from './OptimizationManager';
export type { OptimizationClient, OptimizationContext, OptimizationCell } from './utils/OptimizationClient';

export {
  serializePlacedObjectForFacility,
  serializeBuildingForFacility,
  buildActiveSkinsRecordFromPlacedObjects,
  validateFacilityImportData,
  parseFacilityDataJson,
  estimateFacilityDataSizeBytes,
  isLegacyFacilityFormat,
  collectUniqueSerializedAssetIds,
  reconstructPlacedObjectFromSerialized,
} from './serialization';

export {
  BluDesignEventBus,
  FacilityDraftStorage,
  DEFAULT_AUTOSAVE_STORAGE_KEY,
  createEditorInitialState,
  CachedTextureLoader,
  DraftAutoSaveScheduler,
  type DraftAutoSaveSchedulerDeps,
} from './engine';

export {
  FloorObjectReplication,
  type FloorReplicationPort,
  FloorViewCoordinator,
  type FloorViewCoordinatorApi,
  FloorStructureOperations,
  type FloorStructureOperationsApi,
  generatePlacementObjectId,
  adjustDisplayNameForFloor,
} from './floors';

export {
  resolveClipboardCopyContents,
  type ClipboardCopySelectionPort,
  type ClipboardCopyContents,
  tryStartClipboardPastePreview,
  type ClipboardPastePreviewPort,
} from './clipboard';

export { collectSelectableObjectIds } from './selection';

export {
  getBuildingMaterialsFromTheme,
  isGlassBuildingSkinId,
  applyThemeToPlacedSceneObjects,
  type SceneThemePlacedObjectsPort,
  applySceneThemeEnvironment,
  type SceneThemeEnvironmentPort,
  type GroundTileMaterialUpdater,
} from './theme';

export {
  isValidTextureForSkinning,
  applyCategorySkinToObjectGroup,
  type SkinTextureLoaderPort,
  applyActiveCategorySkinFromTheme,
} from './skins';

