import * as THREE from 'three';
import { FLOOR_HEIGHT, Orientation, type AssetMetadata, type GridPosition, type PlacedObject } from '../../types';
import type { WindowDragBootstrapEntry } from './pendingMoveBootstrap';

/**
 * Mesh XZ when reverting a wall-attached window to its original normalized wall position.
 */
export function windowRevertMeshXZ(w: Pick<
  WindowDragBootstrapEntry,
  'originalWallPosition' | 'wallStart' | 'wallDirection' | 'wallLength'
>): { x: number; z: number } {
  const along = w.originalWallPosition * w.wallLength;
  return {
    x: w.wallStart.x + w.wallDirection.x * along,
    z: w.wallStart.z + w.wallDirection.z * along,
  };
}

export type RegularObjectRevertParams = {
  original: { position: GridPosition; orientation: Orientation };
  obj: PlacedObject;
  asset: AssetMetadata;
  gridSize: number;
  /** From mesh `userData.internalYOffset` (grounding offset). */
  internalYOffset: number;
  gridToWorld: (p: GridPosition) => THREE.Vector3;
};

/**
 * World position for a regular (non-window) object mesh after reverting pending drag.
 * Matches `BluDesignEngine.revertPendingMove` placement math.
 */
export function regularObjectRevertMeshPosition(p: RegularObjectRevertParams): THREE.Vector3 {
  const isRotated90 =
    p.original.orientation === Orientation.EAST || p.original.orientation === Orientation.WEST;
  const effectiveGridX = isRotated90 ? p.asset.gridUnits.z : p.asset.gridUnits.x;
  const effectiveGridZ = isRotated90 ? p.asset.gridUnits.x : p.asset.gridUnits.z;
  const floorY = (p.obj.floor ?? 0) * FLOOR_HEIGHT * p.gridSize;

  const centerWorld = p.gridToWorld({
    x: p.original.position.x + effectiveGridX / 2,
    z: p.original.position.z + effectiveGridZ / 2,
    y: p.original.position.y,
  });

  return new THREE.Vector3(centerWorld.x, floorY + p.internalYOffset, centerWorld.z);
}
