import { AssetCategory, type PlacedObject } from '../types';

/** Outdoor ground surface categories cleared when a building footprint covers their cells. */
export const GROUND_TILE_CLEAR_CATEGORIES: readonly AssetCategory[] = [
  AssetCategory.PAVEMENT,
  AssetCategory.GRASS,
  AssetCategory.GRAVEL,
];

export type GridCellXZ = { x: number; z: number };

/**
 * IDs of ground-type placed objects on **floor 0** whose footprint overlaps any of the given cells.
 * Order follows `placedObjects` iteration; each id appears at most once.
 */
export function collectGroundObjectIdsOverlappingCells(
  cells: GridCellXZ[],
  placedObjects: readonly PlacedObject[]
): string[] {
  if (cells.length === 0) return [];

  const toRemove: string[] = [];

  for (const obj of placedObjects) {
    if (!GROUND_TILE_CLEAR_CATEGORIES.includes(obj.assetMetadata.category)) continue;
    if ((obj.floor ?? 0) !== 0) continue;

    const objPos = obj.position;
    const objWidth = obj.assetMetadata.gridUnits.x;
    const objDepth = obj.assetMetadata.gridUnits.z;

    for (const cell of cells) {
      if (
        cell.x >= objPos.x &&
        cell.x < objPos.x + objWidth &&
        cell.z >= objPos.z &&
        cell.z < objPos.z + objDepth
      ) {
        toRemove.push(obj.id);
        break;
      }
    }
  }

  return toRemove;
}
