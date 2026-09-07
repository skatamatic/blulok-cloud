import * as THREE from 'three';
import type { HistoryAction } from '../ActionHistory';
import type { DeleteActionData } from '../ActionHistory';
import type { Building, PlacedObject } from '../types';
import { parseFloorTileSelectionId } from './floorTileSelectionId';

/**
 * Dependencies for {@link runDeleteSelection} — implemented by `BluDesignEngine` via bound methods.
 */
export interface SelectionDeletionDependencies {
  deleteBuildingWithContents(buildingId: string): void;
  getWallMesh(wallId: string): THREE.Object3D | null | undefined;
  getObjectData(id: string): PlacedObject | undefined;
  getAllBuildings(): Building[];
  getBuildingCells(buildingId: string): Set<string>;
  removeCellsFromBuilding(buildingId: string, cells: Array<{ x: number; z: number }>): void;
  getObjectsAtCell(x: number, z: number, floor: number): string[];
  deleteObjectInternal(objectId: string): void;
  pushDeleteHistoryBatch(actions: HistoryAction[]): void;
  pushDeleteHistorySingle(action: HistoryAction): void;
}

/**
 * Deletes the current selection (whole building shortcut, walls → whole building, partial floor tiles, placed objects).
 * Matches legacy `BluDesignEngine.deleteSelected` behavior.
 */
export function runDeleteSelection(
  selectedIds: string[],
  selectedBuildingId: string | undefined,
  activeFloor: number,
  deps: SelectionDeletionDependencies
): void {
  if (selectedIds.length === 0) return;

  if (selectedBuildingId) {
    deps.deleteBuildingWithContents(selectedBuildingId);
    return;
  }

  const buildingCellsToRemove = new Map<string, Array<{ x: number; z: number }>>();
  const buildingsToDeleteViaWalls = new Set<string>();
  const regularObjectIds: string[] = [];

  for (const id of selectedIds) {
    if (id.startsWith('wall-')) {
      const mesh = deps.getWallMesh(id);
      if (mesh?.userData.buildingId) {
        buildingsToDeleteViaWalls.add(mesh.userData.buildingId as string);
      }
    } else if (id.startsWith('floor-tile-')) {
      const parsed = parseFloorTileSelectionId(id);
      if (parsed) {
        const { buildingId, x, z } = parsed;
        if (!buildingCellsToRemove.has(buildingId)) {
          buildingCellsToRemove.set(buildingId, []);
        }
        buildingCellsToRemove.get(buildingId)!.push({ x, z });
      }
    } else {
      const obj = deps.getObjectData(id);
      if (obj) {
        regularObjectIds.push(id);
      }
    }
  }

  for (const buildingId of buildingsToDeleteViaWalls) {
    deps.deleteBuildingWithContents(buildingId);
  }

  for (const [buildingId, cells] of buildingCellsToRemove) {
    if (buildingsToDeleteViaWalls.has(buildingId)) continue;

    const building = deps.getAllBuildings().find((b) => b.id === buildingId);
    if (building) {
      const allCells = deps.getBuildingCells(buildingId);
      const selectedCellCount = cells.length;

      if (selectedCellCount >= allCells.size) {
        deps.deleteBuildingWithContents(buildingId);
      } else {
        deps.removeCellsFromBuilding(buildingId, cells);

        for (const cell of cells) {
          const atCell = deps.getObjectsAtCell(cell.x, cell.z, activeFloor);
          for (const objId of atCell) {
            if (!regularObjectIds.includes(objId)) {
              regularObjectIds.push(objId);
            }
          }
        }
      }
    }
  }

  if (regularObjectIds.length > 0) {
    const deleteActions: HistoryAction[] = [];
    for (const id of regularObjectIds) {
      const obj = deps.getObjectData(id);
      if (obj) {
        deleteActions.push({
          type: 'delete',
          data: { object: obj } as DeleteActionData,
          timestamp: Date.now(),
        });
      }
    }

    if (deleteActions.length > 1) {
      deps.pushDeleteHistoryBatch(deleteActions);
    } else if (deleteActions.length === 1) {
      deps.pushDeleteHistorySingle(deleteActions[0]);
    }

    for (const id of regularObjectIds) {
      deps.deleteObjectInternal(id);
    }
  }
}
