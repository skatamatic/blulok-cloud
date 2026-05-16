import type { InputCoordinator } from '../InputCoordinator';
import { InputPriority, InputEventType } from '../InputCoordinator';
import { EditorTool } from '../types';

export type BluDesignInputHandlerDeps = {
  inputCoordinator: InputCoordinator;
  getActiveTool: () => EditorTool;
  placementManager: {
    isActive: () => boolean;
    getInputHandlers: () => {
      onMouseDown?: (e: MouseEvent) => void;
      onMouseUp?: (e: MouseEvent) => void;
      onMouseMove?: (e: MouseEvent) => void;
      onContextMenu?: (e: MouseEvent) => void;
      onKeyDown?: (e: KeyboardEvent) => void;
      onKeyUp?: (e: KeyboardEvent) => void;
    };
  };
  selectionManager: {
    getEnabled: () => boolean;
    getInputHandlers: () => {
      onMouseDown?: (e: MouseEvent) => void;
      onMouseUp?: (e: MouseEvent) => void;
      onMouseMove?: (e: MouseEvent) => void;
      onClick?: (e: MouseEvent) => void;
      onDoubleClick?: (e: MouseEvent) => void;
      onKeyDown?: (e: KeyboardEvent) => void;
      onKeyUp?: (e: KeyboardEvent) => void;
    };
  };
  cameraController: { setRotationEnabled: (enabled: boolean) => void };
  translateGizmo: {
    isDraggingGizmo: () => boolean;
    isHovered: () => boolean;
  };
  rotateGizmo: {
    isDraggingGizmo: () => boolean;
    isGizmoHovered: () => boolean;
  };
};

/**
 * Registers gizmo, placement, selection, and camera input handlers on the coordinator.
 */
export function registerBluDesignInputHandlers(deps: BluDesignInputHandlerDeps): void {
  const selectionHandlers = deps.selectionManager.getInputHandlers();
  const placementHandlers = deps.placementManager.getInputHandlers();

  deps.inputCoordinator.registerHandler({
    id: 'gizmo',
    priority: InputPriority.GIZMO,
    enabled: true,
    handle: (event: Event, eventType: InputEventType): boolean => {
      if (eventType === 'wheel') return false;
      if (event instanceof MouseEvent && event.button === 0) {
        const translateActive =
          deps.translateGizmo.isDraggingGizmo() || deps.translateGizmo.isHovered();
        const rotateActive =
          deps.rotateGizmo.isDraggingGizmo() || deps.rotateGizmo.isGizmoHovered();
        return translateActive || rotateActive;
      }
      return false;
    },
    wantsInput: () => {
      const translateActive =
        deps.translateGizmo.isHovered() || deps.translateGizmo.isDraggingGizmo();
      const rotateActive =
        deps.rotateGizmo.isGizmoHovered() || deps.rotateGizmo.isDraggingGizmo();
      return translateActive || rotateActive;
    },
  });

  deps.inputCoordinator.registerHandler({
    id: 'placement',
    priority: InputPriority.PLACEMENT,
    enabled: deps.getActiveTool() === EditorTool.PLACE,
    handle: (event: Event, eventType: InputEventType): boolean => {
      if (event instanceof MouseEvent && event.ctrlKey) {
        return false;
      }
      if (
        deps.placementManager.isActive() &&
        event instanceof MouseEvent &&
        event.button === 0
      ) {
        if (eventType === 'mousedown' || eventType === 'mousemove') {
          return true;
        }
      }
      return false;
    },
    wantsInput: () => deps.getActiveTool() === EditorTool.PLACE,
    onMouseDown: (e: MouseEvent) => {
      if (e.ctrlKey) return;
      placementHandlers.onMouseDown?.(e);
    },
    onMouseUp: placementHandlers.onMouseUp,
    onMouseMove: (e: MouseEvent) => {
      placementHandlers.onMouseMove?.(e);
    },
    onContextMenu: placementHandlers.onContextMenu,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        deps.cameraController.setRotationEnabled(true);
      }
      placementHandlers.onKeyDown?.(e);
    },
    onKeyUp: (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        deps.cameraController.setRotationEnabled(false);
      }
      placementHandlers.onKeyUp?.(e);
    },
  });

  deps.inputCoordinator.registerHandler({
    id: 'selection',
    priority: InputPriority.SELECTION,
    enabled:
      deps.getActiveTool() === EditorTool.SELECT ||
      deps.getActiveTool() === EditorTool.SELECT_BUILDING ||
      deps.getActiveTool() === EditorTool.VIEW,
    handle: (event: Event, eventType: InputEventType): boolean => {
      if (event instanceof MouseEvent && event.ctrlKey) {
        return false;
      }
      if (deps.getActiveTool() === EditorTool.VIEW) {
        if (eventType === 'mousedown' || eventType === 'mousemove') {
          return false;
        }
        return false;
      }
      if (
        deps.selectionManager.getEnabled() &&
        event instanceof MouseEvent &&
        event.button === 0
      ) {
        if (eventType === 'mousedown' || eventType === 'mousemove') {
          return true;
        }
      }
      return false;
    },
    wantsInput: () =>
      deps.getActiveTool() === EditorTool.SELECT ||
      deps.getActiveTool() === EditorTool.SELECT_BUILDING ||
      deps.getActiveTool() === EditorTool.VIEW,
    onMouseDown: (e: MouseEvent) => {
      if (e.ctrlKey) return;
      selectionHandlers.onMouseDown?.(e);
    },
    onMouseUp: selectionHandlers.onMouseUp,
    onMouseMove: (e: MouseEvent) => {
      selectionHandlers.onMouseMove?.(e);
    },
    onClick: selectionHandlers.onClick,
    onDoubleClick: selectionHandlers.onDoubleClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        deps.cameraController.setRotationEnabled(true);
      }
      selectionHandlers.onKeyDown?.(e);
    },
    onKeyUp: (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        deps.cameraController.setRotationEnabled(false);
      }
      selectionHandlers.onKeyUp?.(e);
    },
  });

  deps.inputCoordinator.registerHandler({
    id: 'camera',
    priority: InputPriority.CAMERA,
    enabled: true,
    handle: (): boolean => false,
    wantsInput: () => false,
  });
}
