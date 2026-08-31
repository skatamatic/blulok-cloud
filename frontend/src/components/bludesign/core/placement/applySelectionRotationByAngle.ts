import * as THREE from 'three';
import type { AssetCategory, GridPosition } from '../types';
import { Orientation } from '../types';
import { getRotationFromOrientation } from './effectiveRotation';
import type { MeshRotateEntry } from './collectMeshesForSelectionRotation';
import { syncPlacedObjectOrientationFromWorldYaw } from './orientationFromWorldYaw';

export type SelectionRotationGridPorts = {
  clearOccupied: (objectId: string) => void;
  worldToGrid: (worldPos: THREE.Vector3) => GridPosition;
  getFootprintCenterWorld: (
    anchor: GridPosition,
    footprint: { x: number; z: number }
  ) => THREE.Vector3;
  markOccupied: (
    objectId: string,
    gridPos: GridPosition,
    size: { x: number; z: number },
    canStack: boolean,
    category: AssetCategory | string,
    floor: number
  ) => string | null;
};

export type ApplySelectionRotationByAngleDeps = {
  scene: THREE.Scene;
  grid: SelectionRotationGridPorts;
  /** After multi-select pivot rotation: reposition rotate gizmo from new selection center. */
  syncRotateGizmoFromSelectionCenter: () => void;
};

/**
 * Rotate one or more selected meshes by `deltaAngle` (rad, + = clockwise in Y).
 * Multi-selection uses a temporary pivot at mesh-position centroid; single-select rotates
 * about the footprint bottom center (vertical axis through {@link getFootprintCenterWorld}).
 */
export function applySelectionRotationByAngle(
  deltaAngle: number,
  selectedIds: readonly string[],
  meshesToRotate: MeshRotateEntry[],
  deps: ApplySelectionRotationByAngleDeps
): void {
  if (meshesToRotate.length === 0) return;

  const isMultiSelection = selectedIds.length > 1;
  const { scene, grid } = deps;

  if (isMultiSelection) {
    let sumX = 0;
    let sumZ = 0;
    let sumY = 0;
    for (const { mesh } of meshesToRotate) {
      sumX += mesh.position.x;
      sumZ += mesh.position.z;
      sumY += mesh.position.y;
    }
    const centroid = new THREE.Vector3(
      sumX / meshesToRotate.length,
      sumY / meshesToRotate.length,
      sumZ / meshesToRotate.length
    );

    const pivot = new THREE.Object3D();
    pivot.position.copy(centroid);
    scene.add(pivot);

    for (const { mesh } of meshesToRotate) {
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const worldRotY = mesh.rotation.y;

      scene.remove(mesh);
      pivot.add(mesh);

      mesh.position.set(
        worldPos.x - centroid.x,
        worldPos.y - centroid.y,
        worldPos.z - centroid.z
      );
      mesh.rotation.y = worldRotY;
    }

    pivot.rotation.y = deltaAngle;
    pivot.updateMatrixWorld(true);

    for (const { mesh, placedObject, asset } of meshesToRotate) {
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const worldRotY = mesh.rotation.y + pivot.rotation.y;

      pivot.remove(mesh);
      scene.add(mesh);

      mesh.position.copy(worldPos);
      mesh.rotation.y = worldRotY;

      if (asset) {
        grid.clearOccupied(placedObject.id);
      }

      placedObject.exactMeshPos = { x: mesh.position.x, z: mesh.position.z };
      placedObject.rotation = worldRotY;

      const gridPos = grid.worldToGrid(worldPos);
      placedObject.position = { x: gridPos.x, z: gridPos.z };

      if (asset) {
        grid.markOccupied(
          placedObject.id,
          placedObject.position,
          { x: asset.gridUnits.x, z: asset.gridUnits.z },
          asset.canStack ?? false,
          asset.category,
          placedObject.floor ?? 0
        );
      }

      syncPlacedObjectOrientationFromWorldYaw(placedObject, worldRotY);
    }

    scene.remove(pivot);

    deps.syncRotateGizmoFromSelectionCenter();
  } else {
    const { mesh, placedObject, asset } = meshesToRotate[0];
    const currentRotation =
      placedObject.rotation ?? getRotationFromOrientation(placedObject.orientation);
    const newRotation = currentRotation + deltaAngle;

    if (asset) {
      const isRot90 =
        placedObject.orientation === Orientation.EAST ||
        placedObject.orientation === Orientation.WEST;
      const fx = isRot90 ? asset.gridUnits.z : asset.gridUnits.x;
      const fz = isRot90 ? asset.gridUnits.x : asset.gridUnits.z;
      const pivot = grid.getFootprintCenterWorld(placedObject.position, { x: fx, z: fz });
      const dx = mesh.position.x - pivot.x;
      const dz = mesh.position.z - pivot.z;
      const c = Math.cos(deltaAngle);
      const s = Math.sin(deltaAngle);
      mesh.position.x = pivot.x + dx * c - dz * s;
      mesh.position.z = pivot.z + dx * s + dz * c;
    }

    mesh.rotation.y = newRotation;
    placedObject.rotation = newRotation;
    placedObject.exactMeshPos = { x: mesh.position.x, z: mesh.position.z };

    syncPlacedObjectOrientationFromWorldYaw(placedObject, newRotation);
  }
}
