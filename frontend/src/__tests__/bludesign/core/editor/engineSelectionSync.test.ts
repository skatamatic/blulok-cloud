import { applyEngineSelectionChangeFromManager } from '../../../../components/bludesign/core/editor/engineSelectionSync';
import {
  EditorState,
  EditorTool,
  EditorMode,
} from '../../../../components/bludesign/core/types';

function baseState(): EditorState {
  return {
    mode: EditorMode.EDIT,
    activeTool: EditorTool.SELECT,
    camera: {} as EditorState['camera'],
    selection: {
      selectedIds: ['a'],
      hoveredId: null,
      isMultiSelect: false,
      selectedBuildingId: 'bld-1',
    },
    snap: {} as EditorState['snap'],
    activeAssetId: null,
    activeOrientation: 0 as EditorState['activeOrientation'],
    placementPreview: null,
    buildings: [],
    isFloorMode: true,
    activeFloor: 0,
    ui: {} as EditorState['ui'],
  } as unknown as EditorState;
}

describe('applyEngineSelectionChangeFromManager', () => {
  it('clears selectedBuildingId when selected ids change', () => {
    const state = baseState();
    const emitSelectionChanged = jest.fn();
    const updateGizmoVisibility = jest.fn();

    applyEngineSelectionChangeFromManager(
      {
        selectedIds: ['b'],
        hoveredId: null,
        isMultiSelect: false,
      },
      {
        state,
        updateSelectionHighlights: jest.fn(),
        emitSelectionChanged,
        updateGizmoVisibility,
      }
    );

    expect(state.selection.selectedBuildingId).toBeUndefined();
    expect(updateGizmoVisibility).toHaveBeenCalled();
  });

  it('preserves selectedBuildingId when only hover changes', () => {
    const state = baseState();
    applyEngineSelectionChangeFromManager(
      {
        selectedIds: ['a'],
        hoveredId: 'x',
        isMultiSelect: false,
      },
      {
        state,
        updateSelectionHighlights: jest.fn(),
        emitSelectionChanged: jest.fn(),
        updateGizmoVisibility: jest.fn(),
      }
    );

    expect(state.selection.selectedBuildingId).toBe('bld-1');
  });
});
