/**
 * Resolves which {@link PlacedObject}s and {@link Building}s participate in a clipboard copy
 * from current editor selection. Pure — no clipboard or scene side effects.
 */

import type { Building, PlacedObject } from '../types';

export interface ClipboardCopySelectionPort {
  selectedIds: readonly string[];
  selectedBuildingId: string | undefined;
  getBuilding(buildingId: string): Building | undefined;
  getBuildingCells(buildingId: string): ReadonlySet<string>;
  getAllPlacedObjects(): readonly PlacedObject[];
  getObjectData(id: string): PlacedObject | undefined;
}

export interface ClipboardCopyContents {
  objects: PlacedObject[];
  buildings: Building[];
}

/**
 * When a whole building is selected, includes that building plus objects in its footprint
 * or tagged with its {@link PlacedObject.buildingId}. Otherwise copies data for each selected id.
 */
export function resolveClipboardCopyContents(port: ClipboardCopySelectionPort): ClipboardCopyContents {
  const objects: PlacedObject[] = [];
  const buildings: Building[] = [];

  if (port.selectedIds.length === 0) {
    return { objects, buildings };
  }

  if (port.selectedBuildingId) {
    const building = port.getBuilding(port.selectedBuildingId);
    if (building) {
      buildings.push(building);
      const buildingCells = port.getBuildingCells(building.id);
      for (const obj of port.getAllPlacedObjects()) {
        const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
        if (buildingCells.has(objCellKey) || obj.buildingId === building.id) {
          objects.push(obj);
        }
      }
    }
  } else {
    for (const id of port.selectedIds) {
      const obj = port.getObjectData(id);
      if (obj) {
        objects.push(obj);
      }
    }
  }

  return { objects, buildings };
}
