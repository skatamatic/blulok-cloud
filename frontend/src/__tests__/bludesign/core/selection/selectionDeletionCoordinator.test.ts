import * as THREE from 'three';
import { runDeleteSelection } from '../../../../components/bludesign/core/selection/selectionDeletionCoordinator';
import type { SelectionDeletionDependencies } from '../../../../components/bludesign/core/selection/selectionDeletionCoordinator';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, Building, PlacedObject } from '../../../../components/bludesign/core/types';

function baseAsset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    id: 'asset-1',
    name: 'Test',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 1, z: 1 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    ...overrides,
  } as AssetMetadata;
}

function placedObject(overrides: Partial<PlacedObject> = {}): PlacedObject {
  const asset = baseAsset();
  return {
    id: 'p1',
    assetId: asset.id,
    name: 'P',
    position: { x: 2, z: 3 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: asset,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function building(overrides: Partial<Building> = {}): Building {
  const now = new Date();
  return {
    id: 'b1',
    name: 'B',
    footprints: [],
    floors: [],
    walls: [],
    interiorWalls: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('runDeleteSelection', () => {
  function deps(overrides: Partial<SelectionDeletionDependencies> = {}): SelectionDeletionDependencies {
    return {
      deleteBuildingWithContents: jest.fn(),
      getWallMesh: jest.fn(),
      getObjectData: jest.fn(),
      getAllBuildings: jest.fn(() => []),
      getBuildingCells: jest.fn(() => new Set()),
      removeCellsFromBuilding: jest.fn(),
      getObjectsAtCell: jest.fn(() => []),
      deleteObjectInternal: jest.fn(),
      pushDeleteHistoryBatch: jest.fn(),
      pushDeleteHistorySingle: jest.fn(),
      ...overrides,
    };
  }

  it('deletes the selected building when selectedBuildingId is set', () => {
    const d = deps();
    runDeleteSelection(['wall-1'], 'b-main', 0, d);
    expect(d.deleteBuildingWithContents).toHaveBeenCalledWith('b-main');
    expect(d.deleteObjectInternal).not.toHaveBeenCalled();
  });

  it('deletes whole building when a wall id is selected', () => {
    const wallMesh = new THREE.Object3D();
    wallMesh.userData.buildingId = 'bid-1';
    const d = deps({
      getWallMesh: jest.fn(() => wallMesh),
    });
    runDeleteSelection(['wall-99'], undefined, 0, d);
    expect(d.deleteBuildingWithContents).toHaveBeenCalledWith('bid-1');
  });

  it('removes partial cells, records history, and deletes objects on those cells', () => {
    const floorTileId = 'floor-tile-b1-0-2-3';
    const obj = placedObject({ id: 'o1' });
    const b = building({ id: 'b1' });

    const d = deps({
      getAllBuildings: jest.fn(() => [b]),
      getBuildingCells: jest.fn(() => new Set(['2,3', '9,9'])),
      getObjectsAtCell: jest.fn(() => ['o1']),
      getObjectData: jest.fn((id: string) => (id === 'o1' ? obj : undefined)),
    });

    runDeleteSelection([floorTileId], undefined, 0, d);

    expect(d.removeCellsFromBuilding).toHaveBeenCalledWith('b1', [{ x: 2, z: 3 }]);
    expect(d.pushDeleteHistorySingle).toHaveBeenCalled();
    expect(d.deleteObjectInternal).toHaveBeenCalledWith('o1');
  });

  it('deletes whole building when selected floor tiles cover all cells', () => {
    const idA = 'floor-tile-b1-0-2-3';
    const idB = 'floor-tile-b1-0-9-9';
    const b = building({ id: 'b1' });

    const d = deps({
      getAllBuildings: jest.fn(() => [b]),
      getBuildingCells: jest.fn(() => new Set(['2,3', '9,9'])),
    });

    runDeleteSelection([idA, idB], undefined, 0, d);

    expect(d.deleteBuildingWithContents).toHaveBeenCalledWith('b1');
    expect(d.removeCellsFromBuilding).not.toHaveBeenCalled();
  });

  it('uses batch delete history when multiple standalone objects are removed', () => {
    const o1 = placedObject({ id: 'a' });
    const o2 = placedObject({ id: 'b', position: { x: 0, z: 0 } });

    const d = deps({
      getObjectData: jest.fn((id: string) => {
        if (id === 'a') return o1;
        if (id === 'b') return o2;
        return undefined;
      }),
    });

    runDeleteSelection(['a', 'b'], undefined, 0, d);

    expect(d.pushDeleteHistoryBatch).toHaveBeenCalled();
    expect(d.pushDeleteHistorySingle).not.toHaveBeenCalled();
    expect(d.deleteObjectInternal).toHaveBeenCalledWith('a');
    expect(d.deleteObjectInternal).toHaveBeenCalledWith('b');
  });
});
