/**
 * Viewport / camera helpers: scene bounds, focus orbit math, screen projection, hover rotation query.
 * Keeps BluDesignEngine thinner for view-related behavior.
 */

import * as THREE from 'three';
import type { Building, PlacedObject } from '../types';
import { FLOOR_HEIGHT } from '../types';
import type { GridAlignment } from '../types';
import { getRotationFromOrientation } from '../placement';

export type ScreenBoundsRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function computeBluDesignSceneBounds(deps: {
  getAllPlacedObjects: () => PlacedObject[];
  getObjectMesh: (id: string) => THREE.Object3D | undefined;
  getAllBuildings: () => Building[];
  gridToWorld: (p: { x: number; z: number; y: number }) => THREE.Vector3;
  getGridSize: () => number;
}): THREE.Box3 {
  const bounds = new THREE.Box3();

  for (const obj of deps.getAllPlacedObjects()) {
    const mesh = deps.getObjectMesh(obj.id);
    if (mesh) {
      const objBounds = new THREE.Box3().setFromObject(mesh);
      bounds.union(objBounds);
    }
  }

  const buildings = deps.getAllBuildings();
  const gridSize = deps.getGridSize();
  for (const building of buildings) {
    for (const fp of building.footprints) {
      const minWorld = deps.gridToWorld({ x: fp.minX, z: fp.minZ, y: 0 });
      const maxWorld = deps.gridToWorld({ x: fp.maxX + 1, z: fp.maxZ + 1, y: 0 });
      const height = building.floors.length * FLOOR_HEIGHT * gridSize;

      bounds.expandByPoint(new THREE.Vector3(minWorld.x, 0, minWorld.z));
      bounds.expandByPoint(new THREE.Vector3(maxWorld.x, height, maxWorld.z));
    }
  }

  if (bounds.isEmpty()) {
    bounds.expandByPoint(new THREE.Vector3(-10, 0, -10));
    bounds.expandByPoint(new THREE.Vector3(10, 10, 10));
  }

  return bounds;
}

/** Frame an isometric-style orbit around an axis-aligned world bounds box. */
export function computeFocusOrbitForWorldBounds(
  bounds: THREE.Box3,
  camera: THREE.Camera
): { center: THREE.Vector3; newCameraPos: THREE.Vector3 } {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const targetDistance = maxDim * 1.35;

  const currentDir = new THREE.Vector3();
  camera.getWorldDirection(currentDir);

  const offset = currentDir.negate().multiplyScalar(Math.max(targetDistance, 24));
  offset.y = Math.max(offset.y, targetDistance * 0.55);

  const newCameraPos = center.clone().add(offset);
  return { center, newCameraPos };
}

export function computeFocusOrbitForPlacedObjectMesh(
  mesh: THREE.Object3D,
  camera: THREE.Camera
): { center: THREE.Vector3; newCameraPos: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(mesh);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetDistance = maxDim * 2.0;

  const currentDir = new THREE.Vector3();
  camera.getWorldDirection(currentDir);

  const offset = currentDir.negate().multiplyScalar(Math.max(targetDistance, 12));
  offset.y = Math.max(offset.y, targetDistance * 0.5);

  const newCameraPos = center.clone().add(offset);
  return { center, newCameraPos };
}

export function computeFocusOrbitForBuilding(
  building: Building,
  gridSize: number,
  camera: THREE.Camera
): { center: THREE.Vector3; newCameraPos: THREE.Vector3 } | null {
  const footprints = building.footprints;
  if (footprints.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const fp of footprints) {
    minX = Math.min(minX, fp.minX);
    maxX = Math.max(maxX, fp.maxX);
    minZ = Math.min(minZ, fp.minZ);
    maxZ = Math.max(maxZ, fp.maxZ);
  }

  const centerX = ((minX + maxX) / 2) * gridSize;
  const centerZ = ((minZ + maxZ) / 2) * gridSize;
  const height = building.floors.length * FLOOR_HEIGHT * gridSize;
  const centerY = height / 2;

  const center = new THREE.Vector3(centerX, centerY, centerZ);

  const width = (maxX - minX + 1) * gridSize;
  const depth = (maxZ - minZ + 1) * gridSize;
  const maxDim = Math.max(width, depth, height);

  const targetDistance = maxDim * 1.8;

  const currentDir = new THREE.Vector3();
  camera.getWorldDirection(currentDir);

  const offset = currentDir.negate().multiplyScalar(Math.max(targetDistance, 15));
  offset.y = Math.max(offset.y, targetDistance * 0.5);

  const newCameraPos = center.clone().add(offset);
  return { center, newCameraPos };
}

const BOX_CORNER_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 1],
  [1, 0, 0],
  [1, 0, 1],
  [1, 1, 0],
  [1, 1, 1],
];

export function computeObjectScreenBounds(
  object: THREE.Object3D,
  camera: THREE.Camera,
  containerWidth: number,
  containerHeight: number,
  padding: number = 4
): ScreenBoundsRect {
  const box = new THREE.Box3().setFromObject(object);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const corner = new THREE.Vector3();
  for (const [ix, iy, iz] of BOX_CORNER_OFFSETS) {
    corner.set(
      ix ? box.max.x : box.min.x,
      iy ? box.max.y : box.min.y,
      iz ? box.max.z : box.min.z
    );
    corner.project(camera);
    const screenX = ((corner.x + 1) / 2) * containerWidth;
    const screenY = ((-corner.y + 1) / 2) * containerHeight;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  }

  return {
    left: minX - padding,
    top: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function computeSelectedObjectsScreenBounds(
  selectedIds: string[],
  getObjectMesh: (id: string) => THREE.Object3D | undefined,
  camera: THREE.Camera,
  containerWidth: number,
  containerHeight: number
): Array<{ id: string; bounds: ScreenBoundsRect }> {
  const results: Array<{ id: string; bounds: ScreenBoundsRect }> = [];
  for (const id of selectedIds) {
    const object = getObjectMesh(id);
    if (!object) continue;
    results.push({
      id,
      bounds: computeObjectScreenBounds(object, camera, containerWidth, containerHeight),
    });
  }
  return results;
}

/**
 * Raycast against selectable meshes to read a placed object's yaw (for placement hover alignment).
 */
export function getHoveredPlacedObjectRotation(params: {
  gridAlignment: GridAlignment | null;
  raycaster: THREE.Raycaster;
  pointerNdc: THREE.Vector2;
  camera: THREE.Camera;
  containerRect: DOMRect;
  worldPos: THREE.Vector3;
  mouseEvent: MouseEvent | undefined;
  selectableMeshes: THREE.Object3D[];
  getPlacedObject: (id: string) => PlacedObject | undefined;
}): number | null {
  if (params.gridAlignment) {
    return null;
  }

  if (params.selectableMeshes.length === 0) return null;

  params.raycaster.near = 0.1;
  params.raycaster.far = 1000;

  if (params.mouseEvent) {
    const rect = params.containerRect;
    params.pointerNdc.x =
      ((params.mouseEvent.clientX - rect.left) / rect.width) * 2 - 1;
    params.pointerNdc.y =
      -((params.mouseEvent.clientY - rect.top) / rect.height) * 2 + 1;
    params.raycaster.setFromCamera(params.pointerNdc, params.camera);
  } else {
    const cameraPos = params.camera.position;
    const direction = params.worldPos.clone().sub(cameraPos).normalize();
    params.raycaster.set(cameraPos, direction);
  }

  const intersects = params.raycaster.intersectObjects(params.selectableMeshes, true);

  if (intersects.length > 0) {
    let obj: THREE.Object3D | null = intersects[0].object;
    while (obj && !obj.userData.id) {
      obj = obj.parent;
    }

    if (obj && obj.userData.id) {
      const placedObject = params.getPlacedObject(obj.userData.id);
      if (placedObject) {
        return (
          placedObject.rotation ??
          getRotationFromOrientation(placedObject.orientation)
        );
      }
    }
  }

  return null;
}
