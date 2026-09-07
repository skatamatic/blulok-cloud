import * as THREE from 'three';

/**
 * Runtime data for dragging a window along its wall (matches engine `windowDragData` usage).
 */
export interface WindowWallDragRuntime {
  wallStart: THREE.Vector3;
  wallDirection: THREE.Vector3;
  wallLength: number;
}

/**
 * One visual step: project grid delta onto the wall, clamp along the segment, return new mesh XZ and normalized wall position.
 * Mirrors `BluDesignEngine.updateVisualPositions` for wall-attached windows.
 */
export function stepWindowMeshAlongWall(
  meshX: number,
  meshZ: number,
  deltaGridX: number,
  deltaGridZ: number,
  gridSize: number,
  runtime: WindowWallDragRuntime
): { meshX: number; meshZ: number; currentWallPosition: number } {
  const worldDeltaX = deltaGridX * gridSize;
  const worldDeltaZ = deltaGridZ * gridSize;

  const projectedDelta =
    runtime.wallDirection.x * worldDeltaX + runtime.wallDirection.z * worldDeltaZ;

  const currentWorldPos = new THREE.Vector3(meshX, 0, meshZ);
  const distFromStart = currentWorldPos
    .clone()
    .sub(runtime.wallStart)
    .dot(runtime.wallDirection);
  const newDist = distFromStart + projectedDelta;

  const margin = gridSize * 0.5;
  const clampedDist = Math.max(
    margin,
    Math.min(runtime.wallLength - margin, newDist)
  );
  const currentWallPosition = clampedDist / runtime.wallLength;

  const newX = runtime.wallStart.x + runtime.wallDirection.x * clampedDist;
  const newZ = runtime.wallStart.z + runtime.wallDirection.z * clampedDist;

  return { meshX: newX, meshZ: newZ, currentWallPosition };
}
