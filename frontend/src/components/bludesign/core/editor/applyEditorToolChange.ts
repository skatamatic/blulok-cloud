import { EditorTool, type EditorState } from '../types';

export interface EditorToolPlacementPort {
  cancelPlacement(): void;
}

export interface EditorToolSelectionPort {
  setEnabled(enabled: boolean): void;
  setDragSelectionEnabled(enabled: boolean): void;
  setSmartOnlySelection(enabled: boolean): void;
  setSingleSelectOnly(enabled: boolean): void;
  setIgnoreBuildings(ignore: boolean): void;
}

export interface EditorToolCameraPort {
  setRotationEnabled(enabled: boolean): void;
}

export interface EditorToolInputPort {
  setHandlerEnabled(id: string, enabled: boolean): void;
}

/**
 * Normalizes tool for readonly/edit rules, updates editor state, and syncs selection / camera / input handlers.
 */
export function applyEditorToolChange(
  deps: {
    readonly: boolean;
    placementManager: EditorToolPlacementPort;
    selectionManager: EditorToolSelectionPort;
    cameraController: EditorToolCameraPort;
    inputCoordinator: EditorToolInputPort;
    emitToolChanged: (tool: EditorTool) => void;
    state: Pick<EditorState, 'activeTool' | 'activeAssetId'>;
  },
  requestedTool: EditorTool
): EditorTool {
  let tool = requestedTool;

  if (deps.readonly) {
    tool = EditorTool.VIEW;
  }

  if (!deps.readonly && tool === EditorTool.VIEW) {
    tool = EditorTool.SELECT;
  }

  if (deps.state.activeTool === EditorTool.PLACE && tool !== EditorTool.PLACE) {
    deps.placementManager.cancelPlacement();
    deps.state.activeAssetId = null;
  }

  deps.state.activeTool = tool;

  const isSelectionTool =
    tool === EditorTool.SELECT || tool === EditorTool.SELECT_BUILDING;
  const isViewTool = tool === EditorTool.VIEW;
  const isMoveTool = tool === EditorTool.MOVE;

  deps.selectionManager.setEnabled(isSelectionTool || isViewTool);
  deps.selectionManager.setDragSelectionEnabled(isSelectionTool);

  if (isViewTool) {
    deps.selectionManager.setSmartOnlySelection(true);
    deps.selectionManager.setSingleSelectOnly(true);
  } else {
    deps.selectionManager.setSmartOnlySelection(false);
    deps.selectionManager.setSingleSelectOnly(false);
  }

  deps.selectionManager.setIgnoreBuildings(tool !== EditorTool.SELECT_BUILDING);

  if (isMoveTool || isViewTool) {
    deps.cameraController.setRotationEnabled(true);
  } else {
    deps.cameraController.setRotationEnabled(false);
  }

  deps.inputCoordinator.setHandlerEnabled('placement', tool === EditorTool.PLACE);
  deps.inputCoordinator.setHandlerEnabled(
    'selection',
    isSelectionTool || isViewTool
  );

  deps.emitToolChanged(tool);
  return tool;
}
