import * as THREE from 'three';
import {
  AssetCategory,
  type Building,
  type BuildingFootprint,
  type BuildingWall,
  type GridPosition,
  type Orientation,
  type PlacedObject,
} from '../../types';

export type PendingMoveOriginalSnapshot = {
  position: GridPosition;
  orientation: Orientation;
  rotation?: number;
  exactMeshPos?: { x: number; z: number };
};

/**
 * Window drag runtime captured at pending-move start (matches engine `windowDragData` entries).
 */
export type WindowDragBootstrapEntry = {
  wallId: string;
  originalWallPosition: number;
  currentWallPosition: number;
  wallStart: THREE.Vector3;
  wallEnd: THREE.Vector3;
  wallDirection: THREE.Vector3;
  wallLength: number;
};

export type PendingMoveBootstrapSnapshots = {
  isBuildingMove: boolean;
  buildingId: string | null;
  originalPositions: Map<string, PendingMoveOriginalSnapshot>;
  buildingOriginalFootprints?: BuildingFootprint[];
  windowDragData: Map<string, WindowDragBootstrapEntry>;
};

export function buildPendingMoveSnapshots(
  selectedIds: string[],
  selectedBuildingId: string | undefined,
  deps: {
    getBuildingById: (id: string) => Building | undefined;
    getObjectData: (id: string) => PlacedObject | undefined;
    getWall: (wallId: string) => BuildingWall | undefined;
    gridToWorld: (p: GridPosition) => THREE.Vector3;
  }
): PendingMoveBootstrapSnapshots {
  const buildingId = selectedBuildingId ?? null;
  const isBuildingMove = !!selectedBuildingId;

  const originalPositions = new Map<string, PendingMoveOriginalSnapshot>();
  const windowDragData = new Map<string, WindowDragBootstrapEntry>();

  if (selectedBuildingId) {
    const building = deps.getBuildingById(selectedBuildingId);
    let footprints: BuildingFootprint[] | undefined;
    if (building) {
      footprints = building.footprints.map((fp) => ({
        minX: fp.minX,
        maxX: fp.maxX,
        minZ: fp.minZ,
        maxZ: fp.maxZ,
      }));
    }
    return {
      isBuildingMove,
      buildingId,
      originalPositions,
      buildingOriginalFootprints: footprints,
      windowDragData,
    };
  }

  for (const id of selectedIds) {
    if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;
    const obj = deps.getObjectData(id);
    if (!obj) continue;

    originalPositions.set(id, {
      position: { ...obj.position },
      orientation: obj.orientation,
      rotation: obj.rotation,
      exactMeshPos: obj.exactMeshPos ? { ...obj.exactMeshPos } : undefined,
    });

    if (obj.assetMetadata.category === AssetCategory.WINDOW && obj.wallAttachment) {
      const wallId = obj.wallAttachment.wallId;
      const wall = deps.getWall(wallId);
      if (wall?.startPos && wall.endPos) {
        const startWorld = deps.gridToWorld({ x: wall.startPos.x, z: wall.startPos.z, y: 0 });
        const endWorld = deps.gridToWorld({ x: wall.endPos.x, z: wall.endPos.z, y: 0 });
        const direction = new THREE.Vector3().subVectors(endWorld, startWorld).normalize();
        const length = startWorld.distanceTo(endWorld);

        windowDragData.set(id, {
          wallId,
          originalWallPosition: obj.wallAttachment.position ?? 0.5,
          currentWallPosition: obj.wallAttachment.position ?? 0.5,
          wallStart: startWorld,
          wallEnd: endWorld,
          wallDirection: direction,
          wallLength: length,
        });
      }
    }
  }

  return {
    isBuildingMove,
    buildingId,
    originalPositions,
    windowDragData,
  };
}
