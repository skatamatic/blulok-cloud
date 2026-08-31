/**
 * Pure helpers for {@link BluDesignEngine.importSceneData} / async preload.
 * Keeps format detection in one place and easy to unit test.
 */

import type { FacilityData, LegacyFacilityData, SerializedPlacedObject } from '../types';

/**
 * Whether saved data uses legacy placed objects (full {@link PlacedObject} with embedded assetMetadata).
 * Matches engine logic: v1.0.0, or first placed object carries `assetMetadata`.
 */
export function isLegacyFacilityFormat(data: FacilityData | LegacyFacilityData): boolean {
  if (data.version === '1.0.0') {
    return true;
  }
  if (!data.placedObjects?.length) {
    return false;
  }
  return 'assetMetadata' in data.placedObjects[0];
}

/**
 * Unique asset IDs for v2 serialized objects (for preloading custom assets). Empty when legacy or no objects.
 */
export function collectUniqueSerializedAssetIds(
  data: FacilityData | LegacyFacilityData,
): string[] {
  if (isLegacyFacilityFormat(data)) {
    return [];
  }
  if (!data.placedObjects?.length) {
    return [];
  }
  const ids = (data.placedObjects as SerializedPlacedObject[]).map((o) => o.assetId);
  return [...new Set(ids)];
}
