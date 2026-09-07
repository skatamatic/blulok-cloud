export {
  computeBuildingMovePreviewCells,
  mergedTranslatedFootprintBounds,
  buildingPreviewGizmoGridCenter,
  type BuildingFootprintRect,
} from './buildingMovePreviewGeometry';
export { BuildingMovePreviewController, type BuildingMovePreviewControllerDeps } from './BuildingMovePreviewController';
export { applyBuildingTranslation, type ApplyBuildingTranslationDeps } from './buildingTranslation';
export {
  collectBuildingWallMeshesFromScene,
  validatePlacedObjectMove,
  wouldCrossBuildingWallForMove,
  type SelectionMoveValidationPorts,
  type WallCrossingMoveParams,
} from './selectionMoveValidation';
export {
  keyboardDirectionToGridDelta,
  committedGridPositionFromSnapshot,
  stepWindowMeshAlongWall,
  buildPendingMoveSnapshots,
  windowRevertMeshXZ,
  regularObjectRevertMeshPosition,
  tryCommitPendingObjectMoves,
  type OriginalPositionSnapshot,
  type PendingObjectCommitDeps,
} from './pendingMove';
export {
  GROUND_TILE_CLEAR_CATEGORIES,
  collectGroundObjectIdsOverlappingCells,
  type GridCellXZ,
} from './groundOverlap';
