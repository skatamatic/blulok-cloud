import { EditorTool } from '../../../../components/bludesign/core/types';
import {
  createRotateGizmoCallbacks,
  createTranslateGizmoCallbacks,
} from '../../../../components/bludesign/core/gizmos/gizmoEngineCallbacks';

function makeDeps(activeTool: EditorTool = EditorTool.SELECT) {
  const cameraController = { setControlsEnabled: jest.fn() };
  const selectionManager = {
    setEnabled: jest.fn(),
    setDragSelectionEnabled: jest.fn(),
  };
  const getActiveTool = jest.fn(() => activeTool);
  const onGridDelta = jest.fn();
  const commitPendingMoveNow = jest.fn();
  const updateGizmoPosition = jest.fn();
  const getTranslateGizmo = jest.fn(() => ({ isDraggingGizmo: () => false }));
  const onRotateDelta = jest.fn();
  const captureRotationUndoStart = jest.fn();
  const recordRotationUndoEnd = jest.fn();
  const updateGizmoVisibility = jest.fn();
  const getRotateGizmo = jest.fn(() => ({ isDraggingGizmo: () => false }));

  return {
    cameraController,
    selectionManager,
    getActiveTool,
    onGridDelta,
    commitPendingMoveNow,
    updateGizmoPosition,
    getTranslateGizmo,
    onRotateDelta,
    captureRotationUndoStart,
    recordRotationUndoEnd,
    updateGizmoVisibility,
    getRotateGizmo,
  };
}

describe('createTranslateGizmoCallbacks', () => {
  it('disables camera and selection on drag start', () => {
    const deps = makeDeps();
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onDragStart('x');

    expect(deps.cameraController.setControlsEnabled).toHaveBeenCalledWith(false);
    expect(deps.selectionManager.setEnabled).toHaveBeenCalledWith(false);
  });

  it('forwards grid delta while dragging', () => {
    const deps = makeDeps();
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onDrag(2, -1, 'z');

    expect(deps.onGridDelta).toHaveBeenCalledWith(2, -1, 'z');
  });

  it('commits move and restores selection mode for SELECT tool on drag end', () => {
    const deps = makeDeps(EditorTool.SELECT);
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onDragEnd('x');

    expect(deps.commitPendingMoveNow).toHaveBeenCalled();
    expect(deps.cameraController.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(deps.selectionManager.setEnabled).toHaveBeenCalledWith(true);
    expect(deps.selectionManager.setDragSelectionEnabled).toHaveBeenCalledWith(true);
    expect(deps.updateGizmoPosition).toHaveBeenCalled();
  });

  it('enables selection without drag-select when VIEW tool is active after drag end', () => {
    const deps = makeDeps(EditorTool.VIEW);
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onDragEnd('y');

    expect(deps.selectionManager.setEnabled).toHaveBeenCalledWith(true);
    expect(deps.selectionManager.setDragSelectionEnabled).toHaveBeenCalledWith(false);
  });

  it('re-enables camera on hover end when not dragging', () => {
    const deps = makeDeps();
    deps.getTranslateGizmo.mockReturnValue({ isDraggingGizmo: () => false });
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onHoverChange(true);
    expect(deps.cameraController.setControlsEnabled).toHaveBeenCalledWith(false);

    cbs.onHoverChange(false);
    expect(deps.cameraController.setControlsEnabled).toHaveBeenCalledWith(true);
  });

  it('keeps camera disabled on hover end while still dragging', () => {
    const deps = makeDeps();
    deps.getTranslateGizmo.mockReturnValue({ isDraggingGizmo: () => true });
    const cbs = createTranslateGizmoCallbacks(deps);

    cbs.onHoverChange(false);

    expect(deps.cameraController.setControlsEnabled).not.toHaveBeenCalledWith(true);
  });
});

describe('createRotateGizmoCallbacks', () => {
  it('captures undo start and disables interaction on drag start', () => {
    const deps = makeDeps();
    const cbs = createRotateGizmoCallbacks(deps);

    cbs.onDragStart();

    expect(deps.captureRotationUndoStart).toHaveBeenCalled();
    expect(deps.cameraController.setControlsEnabled).toHaveBeenCalledWith(false);
    expect(deps.selectionManager.setEnabled).toHaveBeenCalledWith(false);
  });

  it('records undo end and updates visibility on drag end', () => {
    const deps = makeDeps(EditorTool.SELECT_BUILDING);
    const cbs = createRotateGizmoCallbacks(deps);

    cbs.onDragEnd(90);

    expect(deps.recordRotationUndoEnd).toHaveBeenCalled();
    expect(deps.selectionManager.setEnabled).toHaveBeenCalledWith(true);
    expect(deps.selectionManager.setDragSelectionEnabled).toHaveBeenCalledWith(true);
    expect(deps.updateGizmoVisibility).toHaveBeenCalled();
  });

  it('forwards rotation delta while dragging', () => {
    const deps = makeDeps();
    const cbs = createRotateGizmoCallbacks(deps);

    cbs.onDrag(15, 45);

    expect(deps.onRotateDelta).toHaveBeenCalledWith(15, 45);
  });
});
