import { EditorTool, type GridPosition, type Orientation, type PlacedObject } from '../types';
import { keyboardHeldRotationDeltaRadians } from './keyboardRotationDelta';

export type RotationSnapshot = {
  position: GridPosition;
  rotation: number | undefined;
  orientation: Orientation;
  exactMeshPos?: { x: number; z: number };
};

/**
 * Ports for {@link EditorRotationCoordinator} — implemented by `BluDesignEngine` with thin closures.
 */
export interface EditorRotationCoordinatorPorts {
  getSelectedIds: () => string[];
  getActiveTool: () => EditorTool;
  isPlacementActive: () => boolean;
  /** True when working grid alignment is active (Alt+Q/E fine-rotate placement is disabled). */
  hasGridAlignment: () => boolean;
  applyFinePlacementRotationDelta: (deltaRadians: number) => void;
  rotateSelectionByAngle: (deltaRadians: number) => void;
  getObjectData: (id: string) => PlacedObject | undefined;
  pushRotateHistory: (
    beforeStates: Map<string, RotationSnapshot>,
    afterStates: Map<string, RotationSnapshot>
  ) => void;
  /** Defaults to `Date.now` (inject for tests / deterministic Alt+Q/E ticks). */
  now?: () => number;
}

/**
 * Owns Alt+Q / Alt+E held rotation, optional fine-rotate for placement ghost,
 * and rotate-undo snapshots shared with the rotate gizmo and discrete 90° rotation.
 */
export class EditorRotationCoordinator {
  private rotationStartStates: Map<string, RotationSnapshot> | null = null;

  constructor(private readonly ports: EditorRotationCoordinatorPorts) {}

  private nowMs(): number {
    return this.ports.now?.() ?? Date.now();
  }

  /**
   * Snapshot selected objects for a subsequent {@link recordToHistory} (gizmo drag, 90° rotate, Alt+Q/E).
   */
  captureStartState(): void {
    const selectedIds = this.ports.getSelectedIds();
    if (selectedIds.length === 0) return;

    this.rotationStartStates = new Map();

    for (const id of selectedIds) {
      if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;

      const placedObject = this.ports.getObjectData(id);
      if (!placedObject) continue;

      this.rotationStartStates.set(id, {
        position: { ...placedObject.position },
        rotation: placedObject.rotation,
        orientation: placedObject.orientation,
        exactMeshPos: placedObject.exactMeshPos
          ? { ...placedObject.exactMeshPos }
          : undefined,
      });
    }
  }

  /**
   * Commit a rotation session to history when something changed; clears snapshots.
   */
  recordToHistory(): void {
    if (!this.rotationStartStates || this.rotationStartStates.size === 0) {
      this.rotationStartStates = null;
      return;
    }

    const afterStates = new Map<string, RotationSnapshot>();
    let hasChanges = false;

    for (const [id, beforeState] of this.rotationStartStates) {
      const placedObject = this.ports.getObjectData(id);
      if (!placedObject) continue;

      const posChanged =
        placedObject.position.x !== beforeState.position.x ||
        placedObject.position.z !== beforeState.position.z;
      const rotChanged = placedObject.rotation !== beforeState.rotation;
      const exactPosChanged =
        placedObject.exactMeshPos?.x !== beforeState.exactMeshPos?.x ||
        placedObject.exactMeshPos?.z !== beforeState.exactMeshPos?.z;

      if (posChanged || rotChanged || exactPosChanged) {
        hasChanges = true;
      }

      afterStates.set(id, {
        position: { ...placedObject.position },
        rotation: placedObject.rotation,
        orientation: placedObject.orientation,
        exactMeshPos: placedObject.exactMeshPos
          ? { ...placedObject.exactMeshPos }
          : undefined,
      });
    }

    if (hasChanges) {
      this.ports.pushRotateHistory(this.rotationStartStates, afterStates);
    }

    this.rotationStartStates = null;
  }

  /**
   * Alt+Q — counter-clockwise step while held.
   */
  handleAltQHold(holdStartTimeMs: number): void {
    if (this.shouldFineRotatePlacementGhost()) {
      const delta = keyboardHeldRotationDeltaRadians(
        holdStartTimeMs,
        -1,
        this.nowMs()
      );
      this.ports.applyFinePlacementRotationDelta(delta);
      return;
    }

    if (!this.rotationStartStates) {
      this.captureStartState();
    }
    const delta = keyboardHeldRotationDeltaRadians(
      holdStartTimeMs,
      -1,
      this.nowMs()
    );
    this.ports.rotateSelectionByAngle(delta);
  }

  /**
   * Alt+E — clockwise step while held.
   */
  handleAltEHold(holdStartTimeMs: number): void {
    if (this.shouldFineRotatePlacementGhost()) {
      const delta = keyboardHeldRotationDeltaRadians(
        holdStartTimeMs,
        1,
        this.nowMs()
      );
      this.ports.applyFinePlacementRotationDelta(delta);
      return;
    }

    if (!this.rotationStartStates) {
      this.captureStartState();
    }
    const delta = keyboardHeldRotationDeltaRadians(
      holdStartTimeMs,
      1,
      this.nowMs()
    );
    this.ports.rotateSelectionByAngle(delta);
  }

  /** Q/E released after Alt+Q/E — finalize history for incremental rotation. */
  onRotationKeyUp(): void {
    this.recordToHistory();
  }

  private shouldFineRotatePlacementGhost(): boolean {
    return (
      this.ports.getActiveTool() === EditorTool.PLACE &&
      this.ports.isPlacementActive() &&
      this.ports.getSelectedIds().length === 0 &&
      !this.ports.hasGridAlignment()
    );
  }
}
