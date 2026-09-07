import * as THREE from 'three';
import type { SceneManager } from '../SceneManager';
import type { Building, PlacedObject } from '../types';
import { Orientation } from '../types';
import { getRotationFromOrientation } from '../placement/effectiveRotation';

export interface SelectionGridCenterInput {
  selectedIds: string[];
  selectedBuildingId: string | undefined;
  getAllBuildings(): Building[];
  getObjectData(id: string): PlacedObject | undefined;
  /** Scene root for locating floor-tile meshes by `userData.id` */
  scene: THREE.Object3D;
}

/**
 * Grid-space center of the current selection (building footprint union or object AABBs).
 * Uses the continuous midpoint `(min+max)/2` in grid indices so `gridToWorld` lands on the
 * footprint center (gizmo + rotation pivot), not a floored cell index.
 * Mirrors `BluDesignEngine.getSelectionCenter`.
 */
export function computeSelectionGridCenter(input: SelectionGridCenterInput): { x: number; z: number } | null {
  const { selectedIds, selectedBuildingId, getAllBuildings, getObjectData, scene } = input;
  if (selectedIds.length === 0) return null;

  if (selectedBuildingId) {
    const building = getAllBuildings().find((b) => b.id === selectedBuildingId);
    if (building) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      building.footprints.forEach((fp) => {
        minX = Math.min(minX, fp.minX);
        maxX = Math.max(maxX, fp.maxX);
        minZ = Math.min(minZ, fp.minZ);
        maxZ = Math.max(maxZ, fp.maxZ);
      });
      return {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
      };
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const id of selectedIds) {
    if (id.startsWith('floor-tile-')) {
      const mesh = findObjectWithUserDataId(scene, id) as THREE.Mesh | null;
      if (mesh?.userData.gridX !== undefined && mesh.userData.gridZ !== undefined) {
        const x = mesh.userData.gridX as number;
        const z = mesh.userData.gridZ as number;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    } else {
      const obj = getObjectData(id);
      if (obj) {
        const asset = obj.assetMetadata;
        const width = asset?.gridUnits?.x ?? 1;
        const depth = asset?.gridUnits?.z ?? 1;
        minX = Math.min(minX, obj.position.x);
        maxX = Math.max(maxX, obj.position.x + width);
        minZ = Math.min(minZ, obj.position.z);
        maxZ = Math.max(maxZ, obj.position.z + depth);
      }
    }
  }

  if (minX === Infinity) return null;

  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
  };
}

function findObjectWithUserDataId(root: THREE.Object3D, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found) return;
    if (child.userData?.id === id) {
      found = child;
    }
  });
  return found;
}

export interface SelectionCenterWorldInput {
  selectedIds: string[];
  sceneManager: Pick<SceneManager, 'getObject' | 'getObjectData'>;
}

/**
 * World-space center of selected meshes (logical centers without internal placement offsets).
 * Mirrors `BluDesignEngine.getSelectionCenterWorld`.
 */
export function computeSelectionCenterWorld(input: SelectionCenterWorldInput): THREE.Vector3 | null {
  const { selectedIds, sceneManager } = input;
  if (selectedIds.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumY = 0;
  let count = 0;

  for (const id of selectedIds) {
    const mesh = sceneManager.getObject(id);
    const placedObject = sceneManager.getObjectData(id);

    if (mesh && placedObject) {
      const internalXOffset = mesh.userData?.internalXOffset || 0;
      const internalZOffset = mesh.userData?.internalZOffset || 0;

      let worldX: number;
      let worldZ: number;

      if (placedObject.exactMeshPos) {
        const currentRotation =
          placedObject.rotation ?? getRotationFromOrientation(placedObject.orientation);
        const cos = Math.cos(currentRotation);
        const sin = Math.sin(currentRotation);
        const rotatedXOffset = internalXOffset * cos - internalZOffset * sin;
        const rotatedZOffset = internalXOffset * sin + internalZOffset * cos;
        worldX = mesh.position.x - rotatedXOffset;
        worldZ = mesh.position.z - rotatedZOffset;
      } else {
        worldX = mesh.position.x - internalXOffset;
        worldZ = mesh.position.z - internalZOffset;
      }

      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
      sumY += mesh.position.y;
      count++;
    }
  }

  if (count === 0) return null;

  return new THREE.Vector3((minX + maxX) / 2, sumY / count, (minZ + maxZ) / 2);
}

/** Rotation value for rotate-gizmo indicator from first selected object */
export function rotationForGizmoIndicator(placed: PlacedObject | undefined): number {
  return placed?.rotation ?? getRotationFromOrientation(placed?.orientation ?? Orientation.NORTH);
}
