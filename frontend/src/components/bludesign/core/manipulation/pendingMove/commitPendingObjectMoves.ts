import {
  Orientation,
  type AssetCategory,
  type GridPosition,
  type PlacedObject,
} from '../../types';
import type { HistoryAction, MoveActionData } from '../../ActionHistory';
import { committedGridPositionFromSnapshot } from './gridTargets';
import type { PendingMoveOriginalSnapshot, WindowDragBootstrapEntry } from './pendingMoveBootstrap';

export type PendingObjectCommitGridPorts = {
  clearOccupied: (objectId: string) => void;
  markOccupied: (
    objectId: string,
    gridPos: GridPosition,
    size: { x: number; z: number },
    canStack: boolean,
    category?: AssetCategory | string,
    floor?: number
  ) => string | null;
  gridDeltaToWorldDelta: (deltaU: number, deltaV: number) => { x: number; z: number };
};

export type PendingObjectCommitDeps = {
  getObjectData: (id: string) => PlacedObject | undefined;
  validateMove: (
    obj: PlacedObject,
    newPosition: GridPosition,
    movingIds: Set<string>
  ) => boolean;
  gridSystem: PendingObjectCommitGridPorts;
  /** Defaults to `Date.now` (new timestamp per recorded action, matching the engine). */
  now?: () => number;
};

export type TryCommitPendingObjectMovesInput = {
  originalPositions: Map<string, PendingMoveOriginalSnapshot>;
  accumulatedDelta: { x: number; z: number };
  windowDragData?: Map<string, WindowDragBootstrapEntry>;
};

/**
 * Validates grid targets, then applies wall-window attachment updates and/or grid moves with
 * occupancy + history payloads. Returns `{ ok: false }` without mutating when validation fails.
 */
export function tryCommitPendingObjectMoves(
  input: TryCommitPendingObjectMovesInput,
  deps: PendingObjectCommitDeps
): { ok: true; moveActions: HistoryAction[] } | { ok: false } {
  const { originalPositions, accumulatedDelta, windowDragData } = input;
  const now = deps.now ?? (() => Date.now());

  const objectsToMove: PlacedObject[] = [];
  for (const [id] of originalPositions) {
    const obj = deps.getObjectData(id);
    if (obj) objectsToMove.push(obj);
  }

  if (objectsToMove.length === 0) {
    return { ok: true, moveActions: [] };
  }

  const newPositions = objectsToMove.map((obj) => {
    const original = originalPositions.get(obj.id);
    return {
      id: obj.id,
      obj,
      newPosition: committedGridPositionFromSnapshot(
        original,
        obj.position,
        accumulatedDelta
      ),
    };
  });

  const movingIds = new Set(objectsToMove.map((o) => o.id));
  const allValid = newPositions.every(({ obj, newPosition }) =>
    deps.validateMove(obj, newPosition, movingIds)
  );

  if (!allValid) {
    return { ok: false };
  }

  const moveActions: HistoryAction[] = [];

  for (const { id, newPosition } of newPositions) {
    const obj = deps.getObjectData(id);
    if (!obj) continue;

    const asset = obj.assetMetadata;
    if (!asset) continue;

    const winData = windowDragData?.get(id);
    if (winData && obj.wallAttachment) {
      obj.wallAttachment.position = winData.currentWallPosition;
      continue;
    }

    const original = originalPositions.get(id);
    const fromPosition = original?.position ?? obj.position;
    const fromOrientation = original?.orientation ?? obj.orientation;

    let toExactMeshPos: { x: number; z: number } | undefined;
    if (obj.exactMeshPos) {
      const gridDeltaX = newPosition.x - fromPosition.x;
      const gridDeltaZ = newPosition.z - fromPosition.z;
      const worldDelta = deps.gridSystem.gridDeltaToWorldDelta(gridDeltaX, gridDeltaZ);
      toExactMeshPos = {
        x: obj.exactMeshPos.x + worldDelta.x,
        z: obj.exactMeshPos.z + worldDelta.z,
      };
      obj.exactMeshPos = toExactMeshPos;
    }

    moveActions.push({
      type: 'move',
      data: {
        objectId: id,
        fromPosition: { ...fromPosition },
        toPosition: { ...newPosition },
        fromOrientation,
        toOrientation: obj.orientation,
        fromRotation: obj.rotation,
        toRotation: obj.rotation,
        fromExactMeshPos: original?.exactMeshPos
          ? { ...original.exactMeshPos }
          : undefined,
        toExactMeshPos,
      } as MoveActionData,
      timestamp: now(),
    });

    deps.gridSystem.clearOccupied(id);
    obj.position = newPosition;

    const isRotated90 =
      obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
    const size = {
      x: isRotated90 ? asset.gridUnits.z : asset.gridUnits.x,
      z: isRotated90 ? asset.gridUnits.x : asset.gridUnits.z,
    };
    deps.gridSystem.markOccupied(
      id,
      newPosition,
      size,
      asset.canStack ?? false,
      asset.category,
      obj.floor ?? 0
    );
  }

  return { ok: true, moveActions };
}
