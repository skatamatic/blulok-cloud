import {
  AssetCategory,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import { getPlacedObjectIdsAtGridCell } from '../../../../components/bludesign/core/placement/gridCellQuery';

function obj(
  id: string,
  pos: { x: number; z: number },
  floor: number
): PlacedObject {
  return {
    id,
    assetId: 'a',
    assetMetadata: {
      id: 'a',
      name: 'a',
      category: AssetCategory.DECORATION,
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
      gridUnits: { x: 1, z: 1 },
    },
    position: { ...pos, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('getPlacedObjectIdsAtGridCell', () => {
  it('matches floored origin cell on the same floor', () => {
    const placed = [
      obj('a', { x: 3.2, z: 4.9 }, 0),
      obj('b', { x: 3, z: 5 }, 0),
    ];
    expect(getPlacedObjectIdsAtGridCell(3, 4, 0, placed)).toEqual(['a']);
    expect(getPlacedObjectIdsAtGridCell(3, 5, 0, placed)).toEqual(['b']);
  });

  it('filters by floor', () => {
    const placed = [obj('a', { x: 1, z: 1 }, 0), obj('b', { x: 1, z: 1 }, 1)];
    expect(getPlacedObjectIdsAtGridCell(1, 1, 0, placed)).toEqual(['a']);
    expect(getPlacedObjectIdsAtGridCell(1, 1, 1, placed)).toEqual(['b']);
  });
});
