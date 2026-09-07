import { EditorTool } from '../types';
import type { GizmoAxis, TranslateGizmo, TranslateGizmoCallbacks } from '../TranslateGizmo';
import type { RotateGizmo, RotateGizmoCallbacks } from '../RotateGizmo';

function selectionToolFlags(activeTool: EditorTool): {
  isSelectionTool: boolean;
  isViewTool: boolean;
} {
  const isSelectionTool =
    activeTool === EditorTool.SELECT || activeTool === EditorTool.SELECT_BUILDING;
  const isViewTool = activeTool === EditorTool.VIEW;
  return { isSelectionTool, isViewTool };
}

/**
 * Translate gizmo: camera/selection handoff during drag + restore tool-consistent selection mode after.
 */
export function createTranslateGizmoCallbacks(deps: {
  cameraController: { setControlsEnabled(enabled: boolean): void };
  selectionManager: {
    setEnabled(enabled: boolean): void;
    setDragSelectionEnabled(enabled: boolean): void;
  };
  getActiveTool: () => EditorTool;
  onGridDelta: (deltaX: number, deltaZ: number, axis: GizmoAxis) => void;
  commitPendingMoveNow: () => void;
  updateGizmoPosition: () => void;
  getTranslateGizmo: () => Pick<TranslateGizmo, 'isDraggingGizmo'>;
}): TranslateGizmoCallbacks {
  return {
    onDragStart: (axis) => {
      console.log('[TranslateGizmo] Drag started:', axis);
      deps.cameraController.setControlsEnabled(false);
      deps.selectionManager.setEnabled(false);
    },
    onDrag: (deltaX, deltaZ, axis) => deps.onGridDelta(deltaX, deltaZ, axis),
    onDragEnd: (axis) => {
      console.log('[TranslateGizmo] Drag ended:', axis);
      deps.commitPendingMoveNow();
      deps.cameraController.setControlsEnabled(true);
      const { isSelectionTool, isViewTool } = selectionToolFlags(deps.getActiveTool());
      deps.selectionManager.setEnabled(isSelectionTool || isViewTool);
      deps.selectionManager.setDragSelectionEnabled(isSelectionTool);
      deps.updateGizmoPosition();
    },
    onHoverChange: (isHovered) => {
      if (isHovered) {
        deps.cameraController.setControlsEnabled(false);
      } else if (!deps.getTranslateGizmo().isDraggingGizmo()) {
        deps.cameraController.setControlsEnabled(true);
      }
    },
  };
}

/**
 * Rotate gizmo: same interaction pattern; rotation history is captured via {@link deps}.
 */
export function createRotateGizmoCallbacks(deps: {
  cameraController: { setControlsEnabled(enabled: boolean): void };
  selectionManager: {
    setEnabled(enabled: boolean): void;
    setDragSelectionEnabled(enabled: boolean): void;
  };
  getActiveTool: () => EditorTool;
  onRotateDelta: (deltaAngle: number, totalAngle: number) => void;
  captureRotationUndoStart: () => void;
  recordRotationUndoEnd: () => void;
  updateGizmoVisibility: () => void;
  getRotateGizmo: () => Pick<RotateGizmo, 'isDraggingGizmo'>;
}): RotateGizmoCallbacks {
  return {
    onDragStart: () => {
      console.log('[RotateGizmo] Drag started');
      deps.cameraController.setControlsEnabled(false);
      deps.selectionManager.setEnabled(false);
      deps.captureRotationUndoStart();
    },
    onDrag: (deltaAngle, _totalAngle) => deps.onRotateDelta(deltaAngle, _totalAngle),
    onDragEnd: (_totalAngle) => {
      console.log('[RotateGizmo] Drag ended');
      deps.recordRotationUndoEnd();
      deps.cameraController.setControlsEnabled(true);
      const { isSelectionTool, isViewTool } = selectionToolFlags(deps.getActiveTool());
      deps.selectionManager.setEnabled(isSelectionTool || isViewTool);
      deps.selectionManager.setDragSelectionEnabled(isSelectionTool);
      deps.updateGizmoVisibility();
    },
    onHoverChange: (isHovered) => {
      if (isHovered) {
        deps.cameraController.setControlsEnabled(false);
      } else if (!deps.getRotateGizmo().isDraggingGizmo()) {
        deps.cameraController.setControlsEnabled(true);
      }
    },
  };
}
