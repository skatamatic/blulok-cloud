import type { PlacedObject } from '../types';
import type { RotateGizmo } from '../RotateGizmo';
import type { TranslateGizmo } from '../TranslateGizmo';
import { rotationForGizmoIndicator } from './selectionGizmoPlacement';

/**
 * Ports for {@link EditorGizmoController} — implemented by `BluDesignEngine` via closures.
 */
export interface EditorGizmoControllerPorts {
  isReadonly(): boolean;
  getSelectedIds(): string[];
  getFloorY(): number;
  getSelectionGridCenter(): { x: number; z: number } | null;
  /** World XZ pivot shared by translate + rotate gizmos (grid footprint center via gridToWorld). */
  getSelectionGizmoPivotXZ(): { x: number; z: number } | null;
  /** First selected placed object (for rotate ring); undefined if none */
  getFirstSelectedPlacedObject(): PlacedObject | undefined;
}

/**
 * Orchestrates translate vs rotate gizmo visibility, position, and Alt mode switching.
 * Low-level mesh interaction remains in {@link TranslateGizmo} / {@link RotateGizmo}.
 */
export class EditorGizmoController {
  gizmoMode: 'translate' | 'rotate' = 'translate';

  constructor(
    private readonly translateGizmo: TranslateGizmo,
    private readonly rotateGizmo: RotateGizmo,
    private readonly ports: EditorGizmoControllerPorts
  ) {}

  updateVisibility(): void {
    if (this.ports.isReadonly()) {
      this.translateGizmo.hide();
      this.rotateGizmo.hide();
      return;
    }

    const selectedIds = this.ports.getSelectedIds();
    if (selectedIds.length === 0) {
      this.translateGizmo.hide();
      this.rotateGizmo.hide();
      return;
    }

    const pivotXZ = this.ports.getSelectionGizmoPivotXZ();
    if (!pivotXZ) {
      this.translateGizmo.hide();
      this.rotateGizmo.hide();
      return;
    }

    const floorY = this.ports.getFloorY();

    if (this.gizmoMode === 'translate') {
      this.rotateGizmo.hide();
      this.translateGizmo.show(pivotXZ, floorY);
    } else if (this.gizmoMode === 'rotate') {
      this.translateGizmo.hide();
      const placedObject = this.ports.getFirstSelectedPlacedObject();
      const currentRotation = rotationForGizmoIndicator(placedObject);
      this.rotateGizmo.show({ x: pivotXZ.x, z: pivotXZ.z }, floorY, currentRotation);
    }
  }

  /**
   * Sync gizmo positions with current selection without changing visibility.
   * Skips while either gizmo is being dragged.
   */
  updatePosition(): void {
    if (this.ports.getSelectedIds().length === 0) {
      this.translateGizmo.hide();
      this.rotateGizmo.hide();
      return;
    }

    if (this.translateGizmo.isDraggingGizmo() || this.rotateGizmo.isDraggingGizmo()) {
      return;
    }

    const pivotXZ = this.ports.getSelectionGizmoPivotXZ();
    const floorY = this.ports.getFloorY();

    if (this.gizmoMode === 'translate' && pivotXZ) {
      this.translateGizmo.setPosition(pivotXZ, floorY);
    } else if (this.gizmoMode === 'rotate' && pivotXZ) {
      const placedObject = this.ports.getFirstSelectedPlacedObject();
      const currentRotation = rotationForGizmoIndicator(placedObject);
      this.rotateGizmo.setPosition({ x: pivotXZ.x, z: pivotXZ.z }, floorY, currentRotation);
    }
  }

  /** Alt held: switch to rotate gizmo when there is a selection */
  onAltPressed(): void {
    if (this.ports.getSelectedIds().length === 0) return;
    if (this.gizmoMode === 'rotate') return;
    this.gizmoMode = 'rotate';
    this.updateVisibility();
  }

  /** Alt released: back to translate gizmo */
  onAltReleased(): void {
    if (this.gizmoMode === 'translate') return;
    this.gizmoMode = 'translate';
    this.updateVisibility();
  }

  /** During building move preview, keep translate gizmo at ghost center */
  setTranslatePositionForBuildingPreview(grid: { x: number; z: number }): void {
    this.translateGizmo.setPositionFromGrid(grid, this.ports.getFloorY());
  }
}
