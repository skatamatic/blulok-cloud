import type { GridPosition, Orientation } from '../../types';

export type OriginalPositionSnapshot = {
  position: GridPosition;
  orientation: Orientation;
  rotation?: number;
  exactMeshPos?: { x: number; z: number };
};

/**
 * Target grid position after applying accumulated grid delta to the snapshot taken at drag start.
 */
export function committedGridPositionFromSnapshot(
  original: OriginalPositionSnapshot | undefined,
  fallbackPosition: GridPosition,
  accumulatedDelta: { x: number; z: number }
): GridPosition {
  return {
    x: (original?.position.x ?? fallbackPosition.x) + accumulatedDelta.x,
    z: (original?.position.z ?? fallbackPosition.z) + accumulatedDelta.z,
    y: original?.position.y ?? fallbackPosition.y,
  };
}
