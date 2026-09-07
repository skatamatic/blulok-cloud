/**
 * Collect IDs from the scene manager’s selectable-object map (walls, tiles, assets).
 */

export function collectSelectableObjectIds(map: ReadonlyMap<string, unknown>): string[] {
  return Array.from(map.keys());
}
