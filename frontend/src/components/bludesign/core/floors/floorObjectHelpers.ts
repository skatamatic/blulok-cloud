/**
 * Helpers for cloning placed objects when copying floors or propagating vertical shafts.
 */

/** Matches editor naming like "Unit A (F2)" */
const FLOOR_SUFFIX = /\(F-?\d+\)/;

export function generatePlacementObjectId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Replace an existing (F#) suffix with the target floor, or leave unchanged if none.
 */
export function adjustDisplayNameForFloor(name: string | undefined, floor: number): string | undefined {
  if (name === undefined) return undefined;
  if (FLOOR_SUFFIX.test(name)) {
    return name.replace(FLOOR_SUFFIX, `(F${floor})`);
  }
  return name;
}
