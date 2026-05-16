import * as THREE from 'three';
import { createFacilityImportServices } from '../../../../components/bludesign/core/persistence/buildFacilityImportServices';
import { CameraMode } from '../../../../components/bludesign/core/types';
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

describe('createFacilityImportServices', () => {
  it('restoreCamera updates state and controller mode', () => {
    const setMode = jest.fn();
    const setIso = jest.fn();
    const state: EditorState = {
      camera: {
        mode: CameraMode.PERSPECTIVE,
        isometricAngle: 0,
        position: new THREE.Vector3(),
        target: new THREE.Vector3(),
        zoom: 1,
      },
    } as EditorState;

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
      isometricAngle: 45,
      position: { x: 1, y: 2, z: 3 },
      target: { x: 0, y: 0, z: 0 },
      zoom: 10,
    });

    expect(setMode).toHaveBeenCalledWith(CameraMode.ISOMETRIC);
    expect(setIso).toHaveBeenCalledWith(45);
    expect(state.camera.zoom).toBe(10);
  });
});
