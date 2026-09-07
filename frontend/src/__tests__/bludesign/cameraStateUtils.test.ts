import { CameraMode, IsometricAngle } from '@/components/bludesign/core/types';
import {
  formatDefaultCameraSummary,
  resolveInitialCameraForImport,
} from '@/components/bludesign/core/camera/cameraStateUtils';

describe('cameraStateUtils', () => {
  const defaultCam = {
    mode: CameraMode.ISOMETRIC,
    isometricAngle: IsometricAngle.SOUTH_WEST,
    position: { x: 1, y: 2, z: 3 },
    target: { x: 0, y: 0, z: 0 },
    zoom: 1,
  };

  const sessionCam = {
    mode: CameraMode.FREE,
    isometricAngle: IsometricAngle.NORTH_EAST,
    position: { x: 9, y: 8, z: 7 },
    target: { x: 1, y: 1, z: 1 },
    zoom: 1,
  };

  it('prefers defaultCamera over session camera on import', () => {
    const resolved = resolveInitialCameraForImport({
      name: 'Test',
      version: '2.0.0',
      camera: sessionCam,
      defaultCamera: defaultCam,
      placedObjects: [],
      buildings: [],
      activeFloor: 0,
      activeSkins: {},
      gridSize: 1,
      showGrid: true,
    });

    expect(resolved).toEqual(defaultCam);
  });

  it('falls back to session camera when no default is saved', () => {
    const resolved = resolveInitialCameraForImport({
      name: 'Test',
      version: '2.0.0',
      camera: sessionCam,
      placedObjects: [],
      buildings: [],
      activeFloor: 0,
      activeSkins: {},
      gridSize: 1,
      showGrid: true,
    });

    expect(resolved).toEqual(sessionCam);
  });

  it('formats a readable default camera summary', () => {
    expect(formatDefaultCameraSummary(defaultCam)).toContain('Isometric');
    expect(formatDefaultCameraSummary(sessionCam)).toBe('Free');
  });
});
