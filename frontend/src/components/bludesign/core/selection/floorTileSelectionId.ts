/**
 * Parse `floor-tile-{buildingId}-{floorLevel}-{x}-{z}` ids used for building floor cell selection.
 * Building UUIDs may contain dashes; we take the last three numeric segments as floor, x, z.
 */
export function parseFloorTileSelectionId(
  id: string
): { buildingId: string; floorLevel: number; x: number; z: number } | null {
  if (!id.startsWith('floor-tile-')) return null;
  const parts = id.split('-');
  if (parts.length < 6) return null;

  const x = parseInt(parts[parts.length - 2], 10);
  const z = parseInt(parts[parts.length - 1], 10);
  const floorLevel = parseInt(parts[parts.length - 3], 10);
  if (Number.isNaN(x) || Number.isNaN(z) || Number.isNaN(floorLevel)) return null;

  const buildingId = parts.slice(2, -3).join('-');
  if (!buildingId) return null;

  return { buildingId, floorLevel, x, z };
}
