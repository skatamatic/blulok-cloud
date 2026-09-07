/**
 * Pure geometry for building drag preview (grid cells + gizmo anchor).
 */

export type BuildingFootprintRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * All integer grid cells covered by footprints after translation by (deltaX, deltaZ).
 */
export function computeBuildingMovePreviewCells(
  footprints: BuildingFootprintRect[],
  deltaX: number,
  deltaZ: number
): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  for (const fp of footprints) {
    for (let x = fp.minX + deltaX; x <= fp.maxX + deltaX; x++) {
      for (let z = fp.minZ + deltaZ; z <= fp.maxZ + deltaZ; z++) {
        cells.push({ x, z });
      }
    }
  }
  return cells;
}

/**
 * Axis-aligned bounds of all footprints after translation (grid space).
 */
export function mergedTranslatedFootprintBounds(
  footprints: BuildingFootprintRect[],
  deltaX: number,
  deltaZ: number
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (footprints.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const fp of footprints) {
    minX = Math.min(minX, fp.minX + deltaX);
    maxX = Math.max(maxX, fp.maxX + deltaX);
    minZ = Math.min(minZ, fp.minZ + deltaZ);
    maxZ = Math.max(maxZ, fp.maxZ + deltaZ);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Gizmo anchor in grid coordinates: center of union of original footprints plus drag delta.
 */
export function buildingPreviewGizmoGridCenter(
  originalFootprints: BuildingFootprintRect[],
  deltaX: number,
  deltaZ: number
): { x: number; z: number } | null {
  if (originalFootprints.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const fp of originalFootprints) {
    minX = Math.min(minX, fp.minX);
    maxX = Math.max(maxX, fp.maxX);
    minZ = Math.min(minZ, fp.minZ);
    maxZ = Math.max(maxZ, fp.maxZ);
  }
  return {
    x: Math.floor((minX + maxX) / 2) + deltaX,
    z: Math.floor((minZ + maxZ) / 2) + deltaZ,
  };
}
