import {
  AssetCategory,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import {
  GROUND_TILE_CLEAR_CATEGORIES,
  collectGroundObjectIdsOverlappingCells,
} from '../../../../components/bludesign/core/manipulation/groundOverlap';

function makeGround(
  id: string,
  pos: { x: number; z: number },
  size: { x: number; z: number },
  category: AssetCategory
): PlacedObject {
  return {
    id,
    assetId: 'g',
    assetMetadata: {
      id: 'g',
      name: 'g',
      category,
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: false,
      canRotate: false,
      canStack: false,
      gridUnits: size,
    },
    position: { ...pos, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('collectGroundObjectIdsOverlappingCells', () => {
  it('returns ids for ground-floor outdoor tiles overlapping any target cell', () => {
    const grass = makeGround('g1', { x: 2, z: 3 }, { x: 2, z: 2 }, AssetCategory.GRASS);
    const pavement = makeGround('p1', { x: 0, z: 0 }, { x: 1, z: 1 }, AssetCategory.PAVEMENT);
    const storage = makeGround('s1', { x: 10, z: 10 }, { x: 1, z: 1 }, AssetCategory.STORAGE_UNIT);

    const ids = collectGroundObjectIdsOverlappingCells([{ x: 3, z: 4 }], [grass, pavement, storage]);
    expect(ids).toEqual(['g1']);
  });

  it('ignores non-ground floors', () => {
    const grass = makeGround('g1', { x: 0, z: 0 }, { x: 2, z: 2 }, AssetCategory.GRASS);
    grass.floor = 1;
    expect(collectGroundObjectIdsOverlappingCells([{ x: 0, z: 0 }], [grass])).toEqual([]);
  });

  it('returns empty for empty cell list', () => {
    expect(
      collectGroundObjectIdsOverlappingCells([], [
        makeGround('g1', { x: 0, z: 0 }, { x: 1, z: 1 }, AssetCategory.GRAVEL),
      ])
    ).toEqual([]);
  });

  it('lists each object at most once', () => {
    const g = makeGround('g1', { x: 0, z: 0 }, { x: 3, z: 3 }, AssetCategory.GRAVEL);
    const ids = collectGroundObjectIdsOverlappingCells(
      [
        { x: 0, z: 0 },
        { x: 1, z: 1 },
      ],
      [g]
    );
    expect(ids).toEqual(['g1']);
  });
});

describe('GROUND_TILE_CLEAR_CATEGORIES', () => {
  it('includes pavement, grass, gravel', () => {
    expect(GROUND_TILE_CLEAR_CATEGORIES).toEqual([
      AssetCategory.PAVEMENT,
      AssetCategory.GRASS,
      AssetCategory.GRAVEL,
    ]);
  });
});
