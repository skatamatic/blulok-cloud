import type { GridSystem } from '../GridSystem';
import type { SceneManager } from '../SceneManager';
import type { FloorManager } from '../FloorManager';
import { FLOOR_HEIGHT, GridPosition, Orientation } from '../types';
import { getRotationFromOrientation } from './effectiveRotation';

export interface MoveObjectInternalDeps {
  sceneManager: Pick<SceneManager, 'getObjectData' | 'getObject'>;
  gridSystem: Pick<
    GridSystem,
    'clearOccupied' | 'getGridSize' | 'gridToWorld' | 'getFootprintCenterWorld' | 'markOccupied'
  >;
}

/**
 * Move an object without recording in history (for undo/redo).
 * Supports restoring rotation and exactMeshPos for angled objects.
 */
export function moveObjectInternal(
  objectId: string,
  newPosition: GridPosition,
  newOrientation: Orientation,
  newRotation: number | undefined,
  newExactMeshPos: { x: number; z: number } | undefined,
  deps: MoveObjectInternalDeps
): void {
  const placedObject = deps.sceneManager.getObjectData(objectId);
  const mesh = deps.sceneManager.getObject(objectId);

  if (!placedObject || !mesh) {
    console.error('Object not found:', objectId);
    return;
  }

  const asset = placedObject.assetMetadata;
  if (!asset) return;

  deps.gridSystem.clearOccupied(objectId);

  const gridSize = deps.gridSystem.getGridSize();
  const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;

  const internalXOffset = mesh.userData.internalXOffset ?? 0;
  const internalYOffset = mesh.userData.internalYOffset ?? 0;
  const internalZOffset = mesh.userData.internalZOffset ?? 0;

  if (newExactMeshPos) {
    mesh.position.set(newExactMeshPos.x, floorY + internalYOffset, newExactMeshPos.z);
    placedObject.exactMeshPos = { ...newExactMeshPos };
  } else {
    const isRotated90 =
      newOrientation === Orientation.EAST || newOrientation === Orientation.WEST;
    const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
    const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
    const centerWorld = deps.gridSystem.getFootprintCenterWorld(newPosition, {
      x: effectiveGridX,
      z: effectiveGridZ,
    });

    mesh.position.set(
      centerWorld.x + internalXOffset,
      floorY + internalYOffset,
      centerWorld.z + internalZOffset
    );
    placedObject.exactMeshPos = undefined;
  }

  if (newRotation !== undefined) {
    mesh.rotation.y = newRotation;
    placedObject.rotation = newRotation;
  } else {
    mesh.rotation.y = getRotationFromOrientation(newOrientation);
    placedObject.rotation = undefined;
  }

  placedObject.position = newPosition;
  placedObject.orientation = newOrientation;

  deps.gridSystem.markOccupied(
    objectId,
    newPosition,
    { x: asset.gridUnits.x, z: asset.gridUnits.z },
    asset.canStack,
    asset.category,
    placedObject.floor ?? 0
  );
}

export interface ApplyRotationStateDeps {
  sceneManager: Pick<SceneManager, 'getObjectData' | 'getObject'>;
  gridSystem: Pick<
    GridSystem,
    'clearOccupied' | 'gridToWorld' | 'getGridSize' | 'getFootprintCenterWorld' | 'markOccupied'
  >;
  floorManager: Pick<FloorManager, 'getCurrentFloorY'>;
  onComplete?(): void;
}

/**
 * Apply a rotation state to objects (used for undo/redo).
 * Restores position, rotation, and orientation for each object.
 */
export function applyRotationState(
  states: Map<
    string,
    {
      position: GridPosition;
      rotation: number | undefined;
      orientation: Orientation;
      exactMeshPos?: { x: number; z: number };
    }
  >,
  deps: ApplyRotationStateDeps
): void {
  for (const [id, state] of states) {
    const placedObject = deps.sceneManager.getObjectData(id);
    const mesh = deps.sceneManager.getObject(id);

    if (!placedObject || !mesh) continue;

    const asset = placedObject.assetMetadata;

    if (asset) {
      deps.gridSystem.clearOccupied(id);
    }

    placedObject.position = { ...state.position };
    placedObject.exactMeshPos = state.exactMeshPos ? { ...state.exactMeshPos } : undefined;

    const internalYOffset = mesh.userData.internalYOffset ?? 0;
    const floorY = deps.floorManager.getCurrentFloorY();

    if (state.exactMeshPos) {
      mesh.position.set(state.exactMeshPos.x, floorY + internalYOffset, state.exactMeshPos.z);
    } else {
      const internalXOffset = mesh.userData.internalXOffset || 0;
      const internalZOffset = mesh.userData.internalZOffset || 0;

      if (asset) {
        const isRotated90 =
          state.orientation === Orientation.EAST || state.orientation === Orientation.WEST;
        const fx = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
        const fz = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
        const centerWorld = deps.gridSystem.getFootprintCenterWorld(placedObject.position, {
          x: fx,
          z: fz,
        });
        mesh.position.set(
          centerWorld.x + internalXOffset,
          floorY + internalYOffset,
          centerWorld.z + internalZOffset
        );
      } else {
        const centerWorld = deps.gridSystem.getFootprintCenterWorld(placedObject.position, {
          x: 1,
          z: 1,
        });
        mesh.position.set(
          centerWorld.x + internalXOffset,
          floorY + internalYOffset,
          centerWorld.z + internalZOffset
        );
      }
    }

    placedObject.rotation = state.rotation;
    placedObject.orientation = state.orientation;

    const effectiveRotation = state.rotation ?? getRotationFromOrientation(state.orientation);
    mesh.rotation.y = effectiveRotation;

    if (asset) {
      deps.gridSystem.markOccupied(
        id,
        placedObject.position,
        { x: asset.gridUnits.x, z: asset.gridUnits.z },
        asset.canStack ?? false,
        asset.category,
        placedObject.floor ?? 0
      );
    }
  }

  deps.onComplete?.();
}
