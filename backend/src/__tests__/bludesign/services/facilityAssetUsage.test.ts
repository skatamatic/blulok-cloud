import {
  countAssetPlacementsInFacility,
  diffFacilityAssetUsage,
  extractFacilityAssetIds,
} from '@/bludesign/services/facilityAssetUsage';
import type { FacilityData } from '@/bludesign/services/facility.service';

describe('facilityAssetUsage', () => {
  const data = (objects: unknown[]): FacilityData => ({
    name: 'Test',
    version: '2.0.0',
    camera: {},
    placedObjects: objects,
    gridSize: 1,
    showGrid: true,
  });

  it('extracts unique asset ids from placed objects', () => {
    const ids = extractFacilityAssetIds(
      data([
        { id: 'o1', assetId: 'a1' },
        { id: 'o2', assetId: 'a2' },
        { id: 'o3', assetId: 'a1' },
      ])
    );
    expect(ids.sort()).toEqual(['a1', 'a2']);
  });

  it('counts placements of a specific asset in a facility', () => {
    const payload = data([
      { id: 'o1', assetId: 'a1' },
      { id: 'o2', assetId: 'a2' },
      { id: 'o3', assetId: 'a1' },
      { id: 'o4', assetId: 'a1' },
    ]);
    expect(countAssetPlacementsInFacility(payload, 'a1')).toBe(3);
    expect(countAssetPlacementsInFacility(payload, 'a2')).toBe(1);
    expect(countAssetPlacementsInFacility(payload, 'missing')).toBe(0);
  });

  it('diffs asset usage on facility update', () => {
    const diff = diffFacilityAssetUsage(['a1', 'a2'], ['a2', 'a3']);
    expect(diff.increment).toEqual(['a3']);
    expect(diff.decrement).toEqual(['a1']);
  });
});
