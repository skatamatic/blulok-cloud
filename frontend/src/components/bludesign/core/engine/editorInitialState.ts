/**
 * Default {@link EditorState} for a new BluDesign session.
 * Pure function — no engine instance required.
 */

import * as THREE from 'three';
import {
  CameraMode,
  EditorMode,
  EditorState,
  EditorTool,
  GridSize,
  IsometricAngle,
  Orientation,
} from '../types';

export function createEditorInitialState(readonly: boolean): EditorState {
  return {
    mode: readonly ? EditorMode.VIEW : EditorMode.EDIT,
    activeTool: readonly ? EditorTool.VIEW : EditorTool.SELECT,
    camera: {
      mode: CameraMode.FREE,
      isometricAngle: IsometricAngle.SOUTH_WEST,
      position: new THREE.Vector3(30, 30, 30),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1,
    },
    selection: {
      selectedIds: [],
      hoveredId: null,
      isMultiSelect: false,
    },
    snap: {
      enabled: true,
      gridSize: GridSize.TINY,
    },
    activeAssetId: null,
    activeOrientation: Orientation.NORTH,
    placementPreview: null,
    activeFloor: 0,
    isFloorMode: false,
    buildings: [],
    ui: {
      showGrid: true,
      showCallouts: true,
      showBoundingBoxes: false,
      panelsCollapsed: {},
      gridAlignment: null,
    },
  };
}
