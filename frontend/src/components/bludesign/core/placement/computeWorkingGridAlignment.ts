import * as THREE from 'three';
import { Orientation, type GridAlignment, type PlacedObject } from '../types';
import { getEffectiveRotation } from './effectiveRotation';

/** Normalize radians to (-pi, pi] */
function normalizeAngleRad(r: number): number {
  return ((r % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/**
 * Derives session working-grid alignment from a placed object's data + mesh position.
 *
 * **Yaw** is the full world Y rotation from {@link getEffectiveRotation}.
 *
 * **Origin** is the world-space position of aligned cell (0,0) min-corner.
 * We derive it from the footprint center (mesh world pos minus model internal offsets) and the
 * half-extent in the aligned UV frame (`fx/2 * gs`, `fz/2 * gs`).
 * `placedObject.position` (world-grid index set at placement time) is NOT used because it is in
 * whatever grid frame was active when the object was placed — not the rotated frame we are creating.
 */
export function computeWorkingGridAlignmentFromPlacedMesh(
  mesh: THREE.Object3D,
  placedObject: PlacedObject,
  gridSizeMeters: number
): GridAlignment {
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);

  const ixOff = typeof mesh.userData.internalXOffset === 'number' ? mesh.userData.internalXOffset : 0;
  const izOff = typeof mesh.userData.internalZOffset === 'number' ? mesh.userData.internalZOffset : 0;
  const fcX = worldPos.x - ixOff;
  const fcZ = worldPos.z - izOff;

  const yaw = normalizeAngleRad(getEffectiveRotation(placedObject));
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);

  const meta = placedObject.assetMetadata;
  if (!meta?.gridUnits) {
    return { yaw, originX: fcX, originZ: fcZ };
  }

  const isRotated90 =
    placedObject.orientation === Orientation.EAST || placedObject.orientation === Orientation.WEST;
  const fx = isRotated90 ? meta.gridUnits.z : meta.gridUnits.x;
  const fz = isRotated90 ? meta.gridUnits.x : meta.gridUnits.z;

  const halfU = (fx / 2) * gridSizeMeters;
  const halfV = (fz / 2) * gridSizeMeters;

  const halfWorldX = halfU * c + halfV * s;
  const halfWorldZ = -halfU * s + halfV * c;

  const minCornerX = fcX - halfWorldX;
  const minCornerZ = fcZ - halfWorldZ;

  return {
    yaw,
    originX: minCornerX,
    originZ: minCornerZ,
  };
}
