/**
 * Extract unique asset definition ids referenced by a saved facility scene.
 */

import type { FacilityData } from './facility.service';

export function extractFacilityAssetIds(data: FacilityData): string[] {
  const ids = new Set<string>();
  const placed = data.placedObjects;
  if (!Array.isArray(placed)) return [];

  for (const raw of placed) {
    if (!raw || typeof raw !== 'object') continue;
    const assetId = (raw as { assetId?: unknown }).assetId;
    if (typeof assetId === 'string' && assetId.length > 0) {
      ids.add(assetId);
    }
  }

  return [...ids];
}

/** Count how many placed objects in a facility reference the given asset definition. */
export function countAssetPlacementsInFacility(
  data: FacilityData,
  assetDefinitionId: string
): number {
  const placed = data.placedObjects;
  if (!Array.isArray(placed)) return 0;

  let count = 0;
  for (const raw of placed) {
    if (!raw || typeof raw !== 'object') continue;
    const assetId = (raw as { assetId?: unknown }).assetId;
    if (assetId === assetDefinitionId) {
      count += 1;
    }
  }

  return count;
}

/** Compute asset ids to increment/decrement when a facility scene changes. */
export function diffFacilityAssetUsage(
  previousIds: string[],
  nextIds: string[]
): { increment: string[]; decrement: string[] } {
  const prev = new Set(previousIds);
  const next = new Set(nextIds);
  return {
    increment: [...next].filter((id) => !prev.has(id)),
    decrement: [...prev].filter((id) => !next.has(id)),
  };
}
