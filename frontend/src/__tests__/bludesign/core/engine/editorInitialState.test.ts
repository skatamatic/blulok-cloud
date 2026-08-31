import { createEditorInitialState } from '../../../../components/bludesign/core/engine/editorInitialState';
import {
  EditorMode,
  EditorTool,
  CameraMode,
  IsometricAngle,
  GridSize,
  Orientation,
} from '../../../../components/bludesign/core/types';

describe('createEditorInitialState', () => {
  it('uses edit mode and select tool when not readonly', () => {
    const s = createEditorInitialState(false);
    expect(s.mode).toBe(EditorMode.EDIT);
    expect(s.activeTool).toBe(EditorTool.SELECT);
  });

  it('uses view mode and view tool when readonly', () => {
    const s = createEditorInitialState(true);
    expect(s.mode).toBe(EditorMode.VIEW);
    expect(s.activeTool).toBe(EditorTool.VIEW);
  });

  it('provides default camera and empty scene collections', () => {
    const s = createEditorInitialState(false);
    expect(s.camera.mode).toBe(CameraMode.FREE);
    expect(s.camera.isometricAngle).toBe(IsometricAngle.SOUTH_WEST);
    expect(s.camera.zoom).toBe(1);
    expect(s.buildings).toEqual([]);
    expect(s.selection.selectedIds).toEqual([]);
    expect(s.snap.gridSize).toBe(GridSize.TINY);
    expect(s.ui.gridAlignment).toBeNull();
  });

  it('initializes placement, floor, and UI fields for a new edit session', () => {
    const s = createEditorInitialState(false);
    expect(s.activeFloor).toBe(0);
    expect(s.isFloorMode).toBe(false);
    expect(s.activeAssetId).toBeNull();
    expect(s.placementPreview).toBeNull();
    expect(s.activeOrientation).toBe(Orientation.NORTH);
    expect(s.snap.enabled).toBe(true);
    expect(s.ui.showGrid).toBe(true);
    expect(s.ui.showCallouts).toBe(true);
    expect(s.ui.showBoundingBoxes).toBe(false);
    expect(s.ui.panelsCollapsed).toEqual({});
  });

  it('initializes selection and hover defaults', () => {
    const s = createEditorInitialState(false);
    expect(s.selection.hoveredId).toBeNull();
    expect(s.selection.isMultiSelect).toBe(false);
  });
});
