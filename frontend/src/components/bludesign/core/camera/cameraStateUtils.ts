import type { CameraState, FacilityData, LegacyFacilityData, SerializedCameraState } from '../types';

/** Round a vector component for stable JSON persistence. */
function roundComponent(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Serialize live editor camera state for facility storage. */
export function serializeCameraState(camera: CameraState): SerializedCameraState {
  return {
    mode: camera.mode,
    isometricAngle: camera.isometricAngle,
    position: {
      x: roundComponent(camera.position.x),
      y: roundComponent(camera.position.y),
      z: roundComponent(camera.position.z),
    },
    target: {
      x: roundComponent(camera.target.x),
      y: roundComponent(camera.target.y),
      z: roundComponent(camera.target.z),
    },
    zoom: roundComponent(camera.zoom),
  };
}

/** Camera used when opening a facility (explicit default wins over last session). */
export function resolveInitialCameraForImport(
  data: FacilityData | LegacyFacilityData
): SerializedCameraState | null {
  if ('defaultCamera' in data && data.defaultCamera) {
    return data.defaultCamera;
  }
  if (data.camera) {
    return data.camera as SerializedCameraState;
  }
  return null;
}

export function formatDefaultCameraSummary(camera: SerializedCameraState): string {
  const modeLabel = camera.mode === 'isometric' ? 'Isometric' : 'Free';
  if (camera.mode === 'isometric') {
    return `${modeLabel} · ${camera.isometricAngle}°`;
  }
  return modeLabel;
}
