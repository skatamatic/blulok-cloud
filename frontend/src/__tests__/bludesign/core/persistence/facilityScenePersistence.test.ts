import * as THREE from 'three';
import { clearFacilityEditorScene } from '../../../../components/bludesign/core/persistence/clearFacilityEditorScene';
import { exportFacilitySceneData } from '../../../../components/bludesign/core/persistence/exportFacilitySceneData';
import {
  AssetCategory,
  CameraMode,
  EditorMode,
  EditorTool,
  GridSize,
  IsometricAngle,
  Orientation,
} from '../../../../components/bludesign/core/types';
import type { Building, EditorState, PlacedObject } from '../../../../components/bludesign/core/types';

jest.mock('../../../../components/bludesign/core/ThemeManager', () => ({
  getThemeManager: () => ({
    getActiveThemeId: () => 'theme-test',
  }),
}));

function minimalState(overrides: Partial<EditorState> = {}): EditorState {
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
      position: new THREE.Vector3(1, 2, 3),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1,
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
    ...overrides,
  };
}

describe('exportFacilitySceneData', () => {
  it('serializes placed objects, buildings, camera rounding, theme id', () => {
    const asset = {
      id: 'a1',
      name: 'U',
      category: AssetCategory.STORAGE_UNIT,
      gridUnits: { x: 1, z: 1 },
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: true,
      canRotate: true,
      canStack: false,
    };
    const po: PlacedObject = {
      id: 'p1',
      assetId: 'a1',
      name: 'x',
      position: { x: 0, z: 0 },
      orientation: Orientation.NORTH,
      canStack: false,
      floor: 0,
      properties: {},
      assetMetadata: asset,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const building: Building = {
      id: 'b1',
      name: 'B',
      footprints: [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }],
      floors: [{ level: 0, height: 3, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const out = exportFacilitySceneData({
      placedObjects: [po],
      state: minimalState(),
      buildings: [building],
      dataSourceConfig: null,
    });

    expect(out.version).toBe('2.0.0');
    expect(out.placedObjects).toHaveLength(1);
    expect(out.buildings).toHaveLength(1);
    expect(out.activeThemeId).toBe('theme-test');
    expect(out.camera.position.x).toBe(1);
  });
});

describe('clearFacilityEditorScene', () => {
  it('removes objects, clears buildings, resets selection and history', () => {
    const removeObject = jest.fn();
    const clearOccupied = jest.fn();
    const clearBuildings = jest.fn();
    const clearFloor = jest.fn();
    const setFloorMode = jest.fn();
    const setGridY = jest.fn();
    const clearSelection = jest.fn();
    const clearHistory = jest.fn();
    const setAlignment = jest.fn();
    const emit = jest.fn();
    const clearDraft = jest.fn();

    const state: EditorState = minimalState({
      buildings: [{ id: 'x' } as Building],
      isFloorMode: true,
      selection: { selectedIds: ['a'], hoveredId: null, isMultiSelect: false },
    });

    clearFacilityEditorScene({
      getState: () => state,
      setWorkingGridAlignment: setAlignment,
      sceneManager: {
        getAllPlacedObjects: () => [{ id: 'o1' } as PlacedObject],
        removeObject,
      } as never,
      gridSystem: { clearOccupied, setGridY } as never,
      buildingManager: { clear: clearBuildings } as never,
      floorManager: { clear: clearFloor } as never,
      selectionManager: { setFloorMode, clearSelection } as never,
      actionHistory: { clear: clearHistory } as never,
      emitStateUpdated: emit,
      clearDraft,
    });

    expect(setAlignment).toHaveBeenCalledWith(null);
    expect(removeObject).toHaveBeenCalledWith('o1');
    expect(clearOccupied).toHaveBeenCalledWith('o1');
    expect(clearBuildings).toHaveBeenCalled();
    expect(state.buildings).toEqual([]);
    expect(state.isFloorMode).toBe(false);
    expect(clearFloor).toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
    expect(clearHistory).toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalled();
  });
});
