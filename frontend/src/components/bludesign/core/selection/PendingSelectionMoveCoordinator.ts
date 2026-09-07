import * as THREE from 'three';
import type { ActionHistory } from '../ActionHistory';
import type { MoveActionData } from '../ActionHistory';
import type { BuildingManager } from '../BuildingManager';
import type { GridSystem } from '../GridSystem';
import type { SceneManager } from '../SceneManager';
import type { SelectionHighlightManager } from '../SelectionHighlightManager';
import type { BuildingMovePreviewController } from '../manipulation/BuildingMovePreviewController';
import {
  buildPendingMoveSnapshots,
  buildingPreviewGizmoGridCenter,
  regularObjectRevertMeshPosition,
  stepWindowMeshAlongWall,
  tryCommitPendingObjectMoves,
  windowRevertMeshXZ,
} from '../manipulation';
import type { EditorGizmoController } from '../gizmos/EditorGizmoController';
import type { GridPosition, PlacedObject } from '../types';

export type PendingMoveSessionState = {
  originalPositions: Map<
    string,
    {
      position: GridPosition;
      orientation: import('../types').Orientation;
      rotation?: number;
      exactMeshPos?: { x: number; z: number };
    }
  >;
  accumulatedDelta: { x: number; z: number };
  commitTimer: ReturnType<typeof setTimeout> | null;
  isBuildingMove: boolean;
  buildingId: string | null;
  buildingOriginalFootprints?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  windowDragData?: Map<
    string,
    {
      wallId: string;
      originalWallPosition: number;
      currentWallPosition: number;
      wallStart: THREE.Vector3;
      wallEnd: THREE.Vector3;
      wallDirection: THREE.Vector3;
      wallLength: number;
    }
  >;
};

export type PendingSelectionMoveCoordinatorDeps = {
  getSelectedIds: () => string[];
  getSelectedBuildingId: () => string | undefined;
  getActiveFloor: () => number;
  gridSystem: GridSystem;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  buildingMovePreviewController: BuildingMovePreviewController;
  selectionHighlightManager: SelectionHighlightManager;
  gizmoController: Pick<
    EditorGizmoController,
    'updatePosition' | 'setTranslatePositionForBuildingPreview'
  >;
  actionHistory: Pick<ActionHistory, 'pushBuildingMove' | 'pushMove' | 'pushBatch'>;
  validateMove: (
    obj: PlacedObject,
    newPosition: GridPosition,
    excludeIds: Set<string>
  ) => boolean;
  /** Applies building translation and updates `state.buildings` / emits (engine). */
  translateBuilding: (buildingId: string, deltaX: number, deltaZ: number) => void;
  /** After a committed building grid move, refresh wall IDs in selection + highlights. */
  refreshWallSelectionAfterBuildingMove: () => void;
  scheduleAutoSave: () => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

const DEFAULT_MOVE_COMMIT_DELAY_MS = 150;

/**
 * Gizmo / keyboard pending move: accumulate grid deltas, preview building moves,
 * debounce-commit object moves with validation, history, and revert.
 */
export class PendingSelectionMoveCoordinator {
  private pendingMove: PendingMoveSessionState | null = null;
  private readonly delayMs: number;

  constructor(
    private readonly deps: PendingSelectionMoveCoordinatorDeps,
    options?: { moveCommitDelayMs?: number }
  ) {
    this.delayMs = options?.moveCommitDelayMs ?? DEFAULT_MOVE_COMMIT_DELAY_MS;
  }

  private get st(): typeof setTimeout {
    return this.deps.setTimeoutFn ?? setTimeout;
  }

  private get ct(): typeof clearTimeout {
    return this.deps.clearTimeoutFn ?? clearTimeout;
  }

  applyGridDelta(deltaX: number, deltaZ: number): void {
    if (deltaX === 0 && deltaZ === 0) return;

    const selectedIds = this.deps.getSelectedIds();
    const buildingId = this.deps.getSelectedBuildingId();

    if (!this.pendingMove) {
      const snapshots = buildPendingMoveSnapshots(selectedIds, buildingId, {
        getBuildingById: (id) =>
          this.deps.buildingManager.getAllBuildings().find((b) => b.id === id),
        getObjectData: (id) => this.deps.sceneManager.getObjectData(id),
        getWall: (wallId) => this.deps.buildingManager.getWall(wallId),
        gridToWorld: (p) => this.deps.gridSystem.gridToWorld(p),
      });
      this.pendingMove = {
        originalPositions: snapshots.originalPositions,
        accumulatedDelta: { x: 0, z: 0 },
        commitTimer: null,
        isBuildingMove: snapshots.isBuildingMove,
        buildingId: snapshots.buildingId,
        windowDragData: snapshots.windowDragData,
      };
      if (snapshots.buildingOriginalFootprints) {
        this.pendingMove.buildingOriginalFootprints = snapshots.buildingOriginalFootprints;
      }
    }

    this.pendingMove.accumulatedDelta.x += deltaX;
    this.pendingMove.accumulatedDelta.z += deltaZ;

    if (this.pendingMove.isBuildingMove && this.pendingMove.buildingId) {
      this.deps.buildingMovePreviewController.show(
        this.pendingMove.buildingOriginalFootprints ?? [],
        this.pendingMove.accumulatedDelta.x,
        this.pendingMove.accumulatedDelta.z,
        this.deps.getActiveFloor()
      );
      this.updateGizmoPositionForPreview(
        this.pendingMove.accumulatedDelta.x,
        this.pendingMove.accumulatedDelta.z
      );
    } else {
      this.updateVisualPositions(deltaX, deltaZ);
      this.deps.gizmoController.updatePosition();
    }

    if (this.pendingMove.commitTimer) {
      this.ct(this.pendingMove.commitTimer);
    }

    if (!this.pendingMove.isBuildingMove) {
      this.pendingMove.commitTimer = this.st(() => {
        this.commitPendingMove();
      }, this.delayMs);
    }
  }

  private updateGizmoPositionForPreview(deltaX: number, deltaZ: number): void {
    const buildingId = this.deps.getSelectedBuildingId();
    if (!buildingId) return;

    const building = this.deps.buildingManager.getAllBuildings().find((b) => b.id === buildingId);
    if (!building || building.footprints.length === 0) return;

    const originalFootprints = this.pendingMove?.buildingOriginalFootprints;
    const center = originalFootprints?.length
      ? buildingPreviewGizmoGridCenter(originalFootprints, deltaX, deltaZ)
      : null;
    if (!center) return;

    this.deps.gizmoController.setTranslatePositionForBuildingPreview({ x: center.x, z: center.z });
  }

  private updateVisualPositions(deltaX: number, deltaZ: number): void {
    const selectedIds = this.deps.getSelectedIds();
    const worldDelta = this.deps.gridSystem.gridDeltaToWorldDelta(deltaX, deltaZ);

    for (const id of selectedIds) {
      if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;

      const mesh = this.deps.sceneManager.getObject(id);
      if (!mesh) continue;

      const windowDragData = this.pendingMove?.windowDragData?.get(id);
      if (windowDragData) {
        const gridSize = this.deps.gridSystem.getGridSize();
        const stepped = stepWindowMeshAlongWall(
          mesh.position.x,
          mesh.position.z,
          deltaX,
          deltaZ,
          gridSize,
          windowDragData
        );
        windowDragData.currentWallPosition = stepped.currentWallPosition;
        mesh.position.x = stepped.meshX;
        mesh.position.z = stepped.meshZ;
      } else {
        mesh.position.x += worldDelta.x;
        mesh.position.z += worldDelta.z;
      }
    }

    this.deps.selectionHighlightManager.updatePositions(selectedIds, (id) => {
      return this.deps.sceneManager.getObject(id) ?? null;
    });
  }

  private commitPendingMove(): void {
    if (!this.pendingMove) return;

    const { originalPositions, accumulatedDelta, isBuildingMove, buildingId } = this.pendingMove;

    if (this.pendingMove.commitTimer) {
      this.ct(this.pendingMove.commitTimer);
    }

    this.deps.buildingMovePreviewController.hide();

    if (isBuildingMove && buildingId) {
      if (accumulatedDelta.x !== 0 || accumulatedDelta.z !== 0) {
        this.deps.actionHistory.pushBuildingMove(buildingId, accumulatedDelta.x, accumulatedDelta.z);
        this.deps.translateBuilding(buildingId, accumulatedDelta.x, accumulatedDelta.z);
        this.deps.refreshWallSelectionAfterBuildingMove();
      }
      this.pendingMove = null;
      this.deps.scheduleAutoSave();
      return;
    }

    const objectsToMove: PlacedObject[] = [];
    for (const [id] of originalPositions) {
      const obj = this.deps.sceneManager.getObjectData(id);
      if (obj) objectsToMove.push(obj);
    }

    if (objectsToMove.length === 0) {
      this.pendingMove = null;
      return;
    }

    const commitResult = tryCommitPendingObjectMoves(
      {
        originalPositions,
        accumulatedDelta,
        windowDragData: this.pendingMove.windowDragData,
      },
      {
        getObjectData: (id) => this.deps.sceneManager.getObjectData(id),
        validateMove: (obj, newPos, exclude) => this.deps.validateMove(obj, newPos, exclude),
        gridSystem: this.deps.gridSystem,
      }
    );

    if (commitResult.ok) {
      const { moveActions } = commitResult;
      if (moveActions.length === 1) {
        const data = moveActions[0].data as MoveActionData;
        this.deps.actionHistory.pushMove(
          data.objectId,
          data.fromPosition,
          data.toPosition,
          data.fromOrientation,
          data.toOrientation,
          data.fromRotation,
          data.toRotation,
          data.fromExactMeshPos,
          data.toExactMeshPos
        );
      } else if (moveActions.length > 1) {
        this.deps.actionHistory.pushBatch(moveActions);
      }
      this.deps.scheduleAutoSave();
    } else {
      this.revertPendingMove();
    }

    this.pendingMove = null;
  }

  private revertPendingMove(): void {
    if (!this.pendingMove) return;

    const { originalPositions, windowDragData } = this.pendingMove;
    const gridSize = this.deps.gridSystem.getGridSize();

    for (const [id, original] of originalPositions) {
      const obj = this.deps.sceneManager.getObjectData(id);
      const mesh = this.deps.sceneManager.getObject(id);

      if (obj && mesh && obj.assetMetadata) {
        const asset = obj.assetMetadata;
        const windowData = windowDragData?.get(id);
        if (windowData && obj.wallAttachment) {
          const { x, z } = windowRevertMeshXZ(windowData);
          mesh.position.x = x;
          mesh.position.z = z;
          continue;
        }

        const pos = regularObjectRevertMeshPosition({
          original,
          obj,
          asset,
          gridSize,
          internalYOffset: mesh.userData.internalYOffset ?? 0,
          gridToWorld: (p) => this.deps.gridSystem.gridToWorld(p),
        });
        mesh.position.copy(pos);
      }
    }

    this.deps.gizmoController.updatePosition();
    const selectedIds = Array.from(originalPositions.keys());
    this.deps.selectionHighlightManager.updatePositions(selectedIds, (id) => {
      return this.deps.sceneManager.getObject(id) ?? null;
    });
  }

  commitNow(): void {
    if (this.pendingMove) {
      if (this.pendingMove.commitTimer) {
        this.ct(this.pendingMove.commitTimer);
      }
      this.commitPendingMove();
    }
  }

  /** Clears timers and preview (e.g. engine dispose). */
  dispose(): void {
    if (this.pendingMove?.commitTimer) {
      this.ct(this.pendingMove.commitTimer);
    }
    this.deps.buildingMovePreviewController.hide();
    this.pendingMove = null;
  }
}
