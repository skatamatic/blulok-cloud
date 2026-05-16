import * as THREE from 'three';
import { createFacilityImportServices } from '../../../../components/bludesign/core/persistence/buildFacilityImportServices';
import {
  CameraMode,
  EditorMode,
  EditorTool,
  GridSize,
  IsometricAngle,
  Orientation,
} from '../../../../components/bludesign/core/types';
import type { EditorState } from '../../../../components/bludesign/core/types';

jest.mock('../../../../components/bludesign/core/OptimizationManager', () => ({
  OptimizationManager: {
    getInstance: () => ({ optimizeAll: jest.fn() }),
  },
}));

jest.mock('../../../../components/bludesign/core/ThemeManager', () => ({
  getThemeManager: () => ({
    getTheme: () => ({ id: 't1' }),
    setActiveTheme: jest.fn(),
  }),
}));

function minimalEditorState(cameraOverrides: Partial<EditorState['camera']> = {}): EditorState {
  return {
    mode: EditorMode.EDIT,
    activeTool: EditorTool.SELECT,
    activeFloor: 0,
    isFloorMode: false,
    activeAssetId: null,
    activeOrientation: Orientation.NORTH,
    placementPreview: null,
    buildings: [],
    camera: {
      mode: CameraMode.FREE,
      isometricAngle: IsometricAngle.NORTH_EAST,
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      zoom: 1,
      ...cameraOverrides,
    },
    selection: {
      selectedIds: [],
      hoveredId: null,
      isMultiSelect: false,
    },
    snap: { enabled: true, gridSize: GridSize.MEDIUM },
    ui: {
      showGrid: true,
      showCallouts: false,
      showBoundingBoxes: false,
      panelsCollapsed: {},
      gridAlignment: null,
    },
  };
}

describe('createFacilityImportServices', () => {
  it('restoreCamera updates state and controller mode', () => {
    const setMode = jest.fn();
    const setIso = jest.fn();
    const state = minimalEditorState();

    const s = createFacilityImportServices({
      getState: () => state,
      sceneManager: { clearObjects: jest.fn() } as never,
      buildingManager: { clear: jest.fn(), restoreBuilding: jest.fn() } as never,
      floorManager: { registerFloor: jest.fn(), setFloor: jest.fn() } as never,
      cameraController: {
        setMode,
        setIsometricAngle: setIso,
      } as never,
      placementCoordinator: { placeFromSavedData: jest.fn() } as never,
      skinManager: { loadFacilitySkins: jest.fn(), setActiveSkin: jest.fn() } as never,
      gridSystem: { setVisible: jest.fn() } as never,
      resetWorkingGridAlignment: jest.fn(),
      setDataSourceConfig: jest.fn(),
      emitStateUpdated: jest.fn(),
      emitThemeMissing: jest.fn(),
    });

    s.restoreCamera({
      mode: CameraMode.ISOMETRIC,
      isometricAngle: IsometricAngle.NORTH_EAST,
      position: new THREE.Vector3(1, 2, 3),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 10,
    });

    expect(setMode).toHaveBeenCalledWith(CameraMode.ISOMETRIC);
    expect(setIso).toHaveBeenCalledWith(IsometricAngle.NORTH_EAST);
    expect(state.camera.zoom).toBe(10);
  });
});
