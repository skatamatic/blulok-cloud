export { ORIGINAL_MATERIALS_SKIN_ID } from './placementConstants';
export { getEffectiveRotation, getRotationFromOrientation } from './effectiveRotation';
export {
  PlacedObjectPlacementCoordinator,
  type PlacedObjectPlacementPorts,
  type PlacementMaterialHooks,
} from './PlacedObjectPlacementCoordinator';
export {
  runBatchAssetPlacement,
  type BatchAssetPlacementDependencies,
} from './batchAssetPlacement';
export {
  PlacementCompletionService,
  type PlacementCompletionServiceDeps,
  type PlacementCompletionStateSlice,
} from './PlacementCompletionService';
export {
  isSmartAssetCategory,
  nextNumberedAssetDisplayName,
} from './smartAssetHelpers';
export {
  moveObjectInternal,
  applyRotationState,
  type MoveObjectInternalDeps,
  type ApplyRotationStateDeps,
} from './objectTransformApply';
export { getPlacedObjectIdsAtGridCell } from './gridCellQuery';
export { syncPlacedObjectOrientationFromWorldYaw } from './orientationFromWorldYaw';
export {
  collectMeshesForSelectionRotation,
  type MeshRotateEntry,
} from './collectMeshesForSelectionRotation';
export {
  applySelectionRotationByAngle,
  type ApplySelectionRotationByAngleDeps,
  type SelectionRotationGridPorts,
} from './applySelectionRotationByAngle';
