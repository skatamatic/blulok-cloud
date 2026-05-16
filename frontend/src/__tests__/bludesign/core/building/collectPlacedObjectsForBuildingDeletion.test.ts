import { collectPlacedObjectsForBuildingDeletion } from '../../../../components/bludesign/core/building/collectPlacedObjectsForBuildingDeletion';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';

function asset(): AssetMetadata {
  return {
    id: 'x',
    name: 'X',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 1, z: 1 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: true,
    canRotate: true,
    canStack: false,
  } as AssetMetadata;
}

function po(overrides: Partial<PlacedObject> = {}): PlacedObject {
  const a = asset();
  return {
    id: 'p1',
    assetId: a.id,
    name: 'P',
    position: { x: 2.2, z: 3.8 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: a,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('collectPlacedObjectsForBuildingDeletion', () => {
  it('includes objects in building cells and by buildingId', () => {
    const cells = new Set(['2,3', '10,10']);
    const placed = [
      po({ id: 'a', position: { x: 2.4, z: 3.1 } }),
      po({ id: 'b', position: { x: 0, z: 0 }, buildingId: 'B1' }),
      po({ id: 'c', position: { x: 100, z: 100 } }),
    ];
    const out = collectPlacedObjectsForBuildingDeletion('B1', cells, placed);
    expect(out.map((o) => o.id).sort()).toEqual(['a', 'b']);
  });
});
