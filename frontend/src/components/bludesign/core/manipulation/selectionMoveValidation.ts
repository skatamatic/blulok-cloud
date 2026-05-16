import * as THREE from 'three';
import type { BuildingManager } from '../BuildingManager';
import type { GridSystem } from '../GridSystem';
import { AssetCategory } from '../types';
import type { GridPosition, PlacedObject } from '../types';
import { Orientation } from '../types';

/**
 * Ports for {@link validatePlacedObjectMove} (mirrors `BluDesignEngine.validateMovePosition`).
 */
export interface SelectionMoveValidationPorts {
  gridSystem: Pick<
    GridSystem,
    'isOccupiedExcluding' | 'getGridSize'
  >;
  buildingManager: Pick<BuildingManager, 'getBuildingAtCell'>;
  /** Scene root used to collect building wall meshes for crossing checks */
  sceneRoot: THREE.Object3D;
}

/**
 * Collect meshes tagged as building walls for a given floor (see `BluDesignEngine.checkWallCrossingForMove`).
 */
export function collectBuildingWallMeshesFromScene(
  sceneRoot: THREE.Object3D,
  floor: number
): THREE.Object3D[] {
  const wallMeshes: THREE.Object3D[] = [];
  sceneRoot.traverse((child) => {
    if (
      child.userData.isBuildingWall &&
      (child.userData.floor === floor || child.userData.floor === undefined)
    ) {
      wallMeshes.push(child);
    }
  });
  return wallMeshes;
}

export interface WallCrossingMoveParams {
  gridPos: GridPosition;
  size: { x: number; z: number };
  gridSize: number;
  wallMeshes: THREE.Object3D[];
}

/**
 * Returns true if the object AABB would cross through the middle of a building wall (invalid move).
 */
export function wouldCrossBuildingWallForMove(params: WallCrossingMoveParams): boolean {
  const { gridPos, size, gridSize, wallMeshes } = params;

  if (wallMeshes.length === 0) return false;

  const objectMinX = gridPos.x * gridSize;
  const objectMaxX = (gridPos.x + size.x) * gridSize;
  const objectMinZ = gridPos.z * gridSize;
  const objectMaxZ = (gridPos.z + size.z) * gridSize;

  for (const wall of wallMeshes) {
    if (!(wall instanceof THREE.Mesh)) continue;

    const wallPos = wall.position;
    const wallOrientation = wall.userData.wallOrientation;
    const wallThickness = 0.15 * gridSize;

    if (wallOrientation === 'north-south') {
      const wallX = wallPos.x;
      const wallMinZ = wallPos.z - gridSize / 2;
      const wallMaxZ = wallPos.z + gridSize / 2;

      if (
        objectMinX < wallX + wallThickness / 2 &&
        objectMaxX > wallX - wallThickness / 2 &&
        objectMinZ < wallMaxZ &&
        objectMaxZ > wallMinZ
      ) {
        const wallRelativeX = wallX - objectMinX;
        if (
          wallRelativeX > wallThickness &&
          wallRelativeX < objectMaxX - objectMinX - wallThickness
        ) {
          return true;
        }
      }
    } else if (wallOrientation === 'east-west') {
      const wallZ = wallPos.z;
      const wallMinX = wallPos.x - gridSize / 2;
      const wallMaxX = wallPos.x + gridSize / 2;

      if (
        objectMinZ < wallZ + wallThickness / 2 &&
        objectMaxZ > wallZ - wallThickness / 2 &&
        objectMinX < wallMaxX &&
        objectMaxX > wallMinX
      ) {
        const wallRelativeZ = wallZ - objectMinZ;
        if (
          wallRelativeZ > wallThickness &&
          wallRelativeZ < objectMaxZ - objectMinZ - wallThickness
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Whether an interactive move to `newPosition` is allowed for `obj` (same rules as the engine).
 */
export function validatePlacedObjectMove(
  obj: PlacedObject,
  newPosition: GridPosition,
  excludeIds: Set<string>,
  ports: SelectionMoveValidationPorts
): boolean {
  if (!obj.assetMetadata) return false;

  const category = obj.assetMetadata.category;
  const floor = obj.floor ?? 0;

  const isRotated90 =
    obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
  const size = {
    x: isRotated90 ? obj.assetMetadata.gridUnits.z : obj.assetMetadata.gridUnits.x,
    z: isRotated90 ? obj.assetMetadata.gridUnits.x : obj.assetMetadata.gridUnits.z,
  };

  const canStack = category === AssetCategory.WALL || category === AssetCategory.FENCE;

  if (
    ports.gridSystem.isOccupiedExcluding(
      newPosition,
      size,
      canStack,
      category,
      floor,
      excludeIds
    )
  ) {
    return false;
  }

  const isGroundMaterial =
    category === AssetCategory.PAVEMENT ||
    category === AssetCategory.GRASS ||
    category === AssetCategory.GRAVEL;

  if (isGroundMaterial) {
    for (let dx = 0; dx < size.x; dx++) {
      for (let dz = 0; dz < size.z; dz++) {
        if (ports.buildingManager.getBuildingAtCell(newPosition.x + dx, newPosition.z + dz)) {
          return false;
        }
      }
    }
  }

  const skipWallCrossing =
    category === AssetCategory.FLOOR ||
    category === AssetCategory.PAVEMENT ||
    category === AssetCategory.GRASS ||
    category === AssetCategory.GRAVEL ||
    category === AssetCategory.WALL ||
    category === AssetCategory.FENCE;

  if (!skipWallCrossing) {
    const wallMeshes = collectBuildingWallMeshesFromScene(ports.sceneRoot, floor);
    const gridSize = ports.gridSystem.getGridSize();
    if (
      wouldCrossBuildingWallForMove({
        gridPos: newPosition,
        size,
        gridSize,
        wallMeshes,
      })
    ) {
      return false;
    }
  }

  if (floor !== 0) {
    const isException =
      category === AssetCategory.WINDOW ||
      category === AssetCategory.BUILDING ||
      category === AssetCategory.STAIRWELL;

    if (!isException) {
      for (let dx = 0; dx < size.x; dx++) {
        for (let dz = 0; dz < size.z; dz++) {
          const cellX = newPosition.x + dx;
          const cellZ = newPosition.z + dz;
          if (!ports.buildingManager.getBuildingAtCell(cellX, cellZ)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}
