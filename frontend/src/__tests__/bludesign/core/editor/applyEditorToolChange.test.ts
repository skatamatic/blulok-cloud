import { EditorTool } from '../../../../components/bludesign/core/types';
import { applyEditorToolChange } from '../../../../components/bludesign/core/editor/applyEditorToolChange';

function makeState(activeTool: EditorTool = EditorTool.SELECT) {
  return { activeTool, activeAssetId: 'asset-1' as string | null };
}

describe('applyEditorToolChange', () => {
  it('forces VIEW in readonly mode and syncs handlers', () => {
    const placementManager = { cancelPlacement: jest.fn() };
    const selectionManager = {
      setEnabled: jest.fn(),
      setDragSelectionEnabled: jest.fn(),
      setSmartOnlySelection: jest.fn(),
      setSingleSelectOnly: jest.fn(),
      setIgnoreBuildings: jest.fn(),
    };
    const cameraController = { setRotationEnabled: jest.fn() };
    const inputCoordinator = { setHandlerEnabled: jest.fn() };
    const emitToolChanged = jest.fn();
    const state = makeState(EditorTool.SELECT);

    const result = applyEditorToolChange(
      {
        readonly: true,
        placementManager,
        selectionManager,
        cameraController,
        inputCoordinator,
        emitToolChanged,
        state,
      },
      EditorTool.PLACE
    );

    expect(result).toBe(EditorTool.VIEW);
    expect(state.activeTool).toBe(EditorTool.VIEW);
    expect(selectionManager.setEnabled).toHaveBeenCalledWith(true);
    expect(selectionManager.setSmartOnlySelection).toHaveBeenCalledWith(true);
    expect(cameraController.setRotationEnabled).toHaveBeenCalledWith(true);
    expect(inputCoordinator.setHandlerEnabled).toHaveBeenCalledWith('placement', false);
    expect(inputCoordinator.setHandlerEnabled).toHaveBeenCalledWith('selection', true);
    expect(emitToolChanged).toHaveBeenCalledWith(EditorTool.VIEW);
  });

  it('maps VIEW to SELECT when not readonly', () => {
    const state = makeState(EditorTool.SELECT);
    applyEditorToolChange(
      {
        readonly: false,
        placementManager: { cancelPlacement: jest.fn() },
        selectionManager: {
          setEnabled: jest.fn(),
          setDragSelectionEnabled: jest.fn(),
          setSmartOnlySelection: jest.fn(),
          setSingleSelectOnly: jest.fn(),
          setIgnoreBuildings: jest.fn(),
        },
        cameraController: { setRotationEnabled: jest.fn() },
        inputCoordinator: { setHandlerEnabled: jest.fn() },
        emitToolChanged: jest.fn(),
        state,
      },
      EditorTool.VIEW
    );
    expect(state.activeTool).toBe(EditorTool.SELECT);
  });

  it('cancels placement and clears active asset when leaving PLACE', () => {
    const cancelPlacement = jest.fn();
    const state = makeState(EditorTool.PLACE);
    state.activeAssetId = 'x';

    applyEditorToolChange(
      {
        readonly: false,
        placementManager: { cancelPlacement },
        selectionManager: {
          setEnabled: jest.fn(),
          setDragSelectionEnabled: jest.fn(),
          setSmartOnlySelection: jest.fn(),
          setSingleSelectOnly: jest.fn(),
          setIgnoreBuildings: jest.fn(),
        },
        cameraController: { setRotationEnabled: jest.fn() },
        inputCoordinator: { setHandlerEnabled: jest.fn() },
        emitToolChanged: jest.fn(),
        state,
      },
      EditorTool.SELECT
    );

    expect(cancelPlacement).toHaveBeenCalled();
    expect(state.activeAssetId).toBeNull();
  });

  it('allows building selection only in SELECT_BUILDING', () => {
    const setIgnoreBuildings = jest.fn();
    const state = makeState(EditorTool.SELECT);

    applyEditorToolChange(
      {
        readonly: false,
        placementManager: { cancelPlacement: jest.fn() },
        selectionManager: {
          setEnabled: jest.fn(),
          setDragSelectionEnabled: jest.fn(),
          setSmartOnlySelection: jest.fn(),
          setSingleSelectOnly: jest.fn(),
          setIgnoreBuildings,
        },
        cameraController: { setRotationEnabled: jest.fn() },
        inputCoordinator: { setHandlerEnabled: jest.fn() },
        emitToolChanged: jest.fn(),
        state,
      },
      EditorTool.SELECT_BUILDING
    );

    expect(setIgnoreBuildings).toHaveBeenCalledWith(false);
  });
});
