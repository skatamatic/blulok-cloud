import { applyBuildingTranslation } from '../../../../components/bludesign/core/manipulation/buildingTranslation';
import { Orientation } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

function po(overrides: Partial<PlacedObject> & { id: string }): PlacedObject {
  return {
    assetId: 'a',
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {} as PlacedObject['assetMetadata'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('applyBuildingTranslation', () => {
  it('translates building then moves objects in old cells or with matching buildingId', () => {
    const translateBuilding = jest.fn();
    const getBuildingCells = jest.fn(() => new Set(['0,0', '1,0']));
    const inner = jest.fn();

    const o1 = po({ id: 'o1', position: { x: 0, z: 0, y: 0 } });
    const o2 = po({ id: 'o2', position: { x: 10, z: 10, y: 0 }, buildingId: 'b1' });
    const o3 = po({ id: 'o3', position: { x: 5, z: 5, y: 0 } });

    applyBuildingTranslation('b1', 2, -1, {
      buildingManager: { getBuildingCells, translateBuilding },
      sceneManager: {
        getAllPlacedObjects: () => [o1, o2, o3],
      },
      movePlacedObjectForTranslate: inner,
    });

    expect(translateBuilding).toHaveBeenCalledWith('b1', 2, -1);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenCalledWith(
      'o1',
      { x: 2, z: -1, y: 0 },
      Orientation.NORTH
    );
    expect(inner).toHaveBeenCalledWith(
      'o2',
      { x: 12, z: 9, y: 0 },
      Orientation.NORTH
    );
  });

  it('calls translate even when no objects move', () => {
    const translateBuilding = jest.fn();
    applyBuildingTranslation('b1', 1, 0, {
      buildingManager: {
        getBuildingCells: jest.fn(() => new Set()),
        translateBuilding,
      },
      sceneManager: { getAllPlacedObjects: () => [] },
      movePlacedObjectForTranslate: jest.fn(),
    });
    expect(translateBuilding).toHaveBeenCalledWith('b1', 1, 0);
  });
});
