import { AssetCategory } from '../types';

const SMART_CATEGORIES: readonly AssetCategory[] = [
  AssetCategory.STORAGE_UNIT,
  AssetCategory.GATE,
  AssetCategory.DOOR,
  AssetCategory.ELEVATOR,
  AssetCategory.ACCESS_CONTROL,
];

export function isSmartAssetCategory(category: AssetCategory): boolean {
  return SMART_CATEGORIES.includes(category);
}

/**
 * Auto-name pattern `{assetName} {n}` per asset id (storage-unit 1, storage-unit 2, …).
 * Mutates `counters`.
 */
export function nextNumberedAssetDisplayName(
  assetId: string,
  assetName: string,
  counters: Map<string, number>
): string {
  const count = (counters.get(assetId) ?? 0) + 1;
  counters.set(assetId, count);
  return `${assetName} ${count}`;
}
