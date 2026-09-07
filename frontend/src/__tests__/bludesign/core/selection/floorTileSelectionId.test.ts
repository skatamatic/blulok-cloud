import { parseFloorTileSelectionId } from '../../../../components/bludesign/core/selection/floorTileSelectionId';

describe('parseFloorTileSelectionId', () => {
  it('parses ids with UUID building id', () => {
    const id = 'floor-tile-550e8400-e29b-41d4-a716-446655440000-0-3-5';
    expect(parseFloorTileSelectionId(id)).toEqual({
      buildingId: '550e8400-e29b-41d4-a716-446655440000',
      floorLevel: 0,
      x: 3,
      z: 5,
    });
  });

  it('parses simple building id segment', () => {
    expect(parseFloorTileSelectionId('floor-tile-b1-0-2-3')).toEqual({
      buildingId: 'b1',
      floorLevel: 0,
      x: 2,
      z: 3,
    });
  });

  it('returns null for non floor-tile ids', () => {
    expect(parseFloorTileSelectionId('wall-1')).toBeNull();
  });

  it('returns null when too few segments', () => {
    expect(parseFloorTileSelectionId('floor-tile-a-b')).toBeNull();
  });

  it('returns null when trailing parts are not numeric', () => {
    expect(parseFloorTileSelectionId('floor-tile-b1-0-x-y')).toBeNull();
  });
});
