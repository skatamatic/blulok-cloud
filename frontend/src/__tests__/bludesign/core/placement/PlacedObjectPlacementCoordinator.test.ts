/**
 * Placed-object placement coordinator — port wiring and branch behavior (mocked Three + AssetFactory).
 */

import * as THREE from 'three';
import { PlacedObjectPlacementCoordinator } from '../../../../components/bludesign/core/placement/PlacedObjectPlacementCoordinator';
import { AssetCategory } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';
import { Orientation } from '../../../../components/bludesign/core/types';
import { ORIGINAL_MATERIALS_SKIN_ID } from '../../../../components/bludesign/core/placement/placementConstants';

jest.mock('../../../../components/bludesign/assets/AssetFactory', () => ({
  AssetFactory: {
    createAssetMesh: jest.fn(() => {
      const g = new THREE.Group();
      g.position.set(0.1, 0.25, 0.3);
      return g;
    }),
  },
}));

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

describe('PlacedObjectPlacementCoordinator', () => {
  function makeCoordinator() {
    const scene = new THREE.Scene();
    const gridToWorld = jest.fn((_pos: { x: number; z: number; y?: number }) => new THREE.Vector3(10, 0, 20));
    const gridSystem = {
      getGridSize: jest.fn(() => 1),
      gridToWorld,
      getFootprintCenterWorld: jest.fn(),
      getGridAlignment: jest.fn(() => null),
      markOccupied: jest.fn(() => null as string | null),
      markOccupiedAlignedFootprint: jest.fn(() => null as string | null),
    };
    gridSystem.getFootprintCenterWorld.mockImplementation(
      (anchor: { x: number; z: number; y?: number }, _fp: { x: number; z: number }) =>
        gridToWorld({
          x: anchor.x + _fp.x / 2,
          z: anchor.z + _fp.z / 2,
          y: anchor.y,
        })
    );
    const sceneManager = {
      addObject: jest.fn(),
      removeObject: jest.fn(),
    };
    const buildingManager = {
      getWallMesh: jest.fn(),
      getWall: jest.fn(),
      addWallOpening: jest.fn(),
    };
    const groundTileManager = {
      isGroundTileCategory: jest.fn(() => false),
      addTile: jest.fn(() => new THREE.Object3D()),
      removeTile: jest.fn(),
    };
    const floorManager = {
      applyGhostingToObject: jest.fn(),
    };
    const materials = {
      storeDefaultMaterials: jest.fn(),
      resetToDefaultMaterials: jest.fn(),
      applySkinToObject: jest.fn(),
      applyActiveThemeSkin: jest.fn(),
    };
    const getSkinById = jest.fn();

    const coord = new PlacedObjectPlacementCoordinator({
      gridSystem,
      scene,
      sceneManager,
      buildingManager,
      groundTileManager,
      floorManager,
      materials,
      getSkinById,
    });

    return {
      coord,
      scene,
      gridSystem,
      sceneManager,
      buildingManager,
      groundTileManager,
      floorManager,
      materials,
      getSkinById,
    };
  }

  it('placeForHistory uses ground-tile path when category is a ground tile', () => {
    const { coord, scene, groundTileManager, sceneManager, gridSystem } = makeCoordinator();
    const marker = new THREE.Object3D();
    groundTileManager.isGroundTileCategory.mockReturnValue(true);
    groundTileManager.addTile.mockReturnValue(marker);

    const asset = baseAsset({ category: AssetCategory.GRASS });
    const po = placedObject({ assetMetadata: asset });

    coord.placeForHistory(po);

    expect(groundTileManager.addTile).toHaveBeenCalledWith(po.id, AssetCategory.GRASS, po.position);
    expect(sceneManager.addObject).toHaveBeenCalledWith(po.id, marker, po, { trackOnly: true });
    expect(gridSystem.markOccupied).toHaveBeenCalled();
    expect(gridSystem.markOccupiedAlignedFootprint).not.toHaveBeenCalled();
  });

  it('placeForHistory uses aligned footprint occupancy when grid alignment is active', () => {
    const { coord, gridSystem, groundTileManager } = makeCoordinator();
    groundTileManager.isGroundTileCategory.mockReturnValue(true);
    groundTileManager.addTile.mockReturnValue(new THREE.Object3D());
    gridSystem.getGridAlignment.mockReturnValue({} as never);

    const asset = baseAsset({ category: AssetCategory.GRASS });
    coord.placeForHistory(placedObject({ assetMetadata: asset }));

    expect(gridSystem.markOccupiedAlignedFootprint).toHaveBeenCalled();
    expect(gridSystem.markOccupied).not.toHaveBeenCalled();
  });

  it('placeInteractiveSingle applies theme when no skin override', () => {
    const { coord, materials, sceneManager } = makeCoordinator();
    const po = placedObject({ skinId: undefined });

    coord.placeInteractiveSingle(po, po.assetMetadata);

    expect(materials.storeDefaultMaterials).toHaveBeenCalled();
    expect(materials.applyActiveThemeSkin).toHaveBeenCalled();
    expect(sceneManager.addObject).toHaveBeenCalled();
  });

  it('placeInteractiveSingle resets materials for original-materials skin id', () => {
    const { coord, materials } = makeCoordinator();
    const po = placedObject({ skinId: ORIGINAL_MATERIALS_SKIN_ID });

    coord.placeInteractiveSingle(po, po.assetMetadata);

    expect(materials.resetToDefaultMaterials).toHaveBeenCalled();
    expect(materials.applySkinToObject).not.toHaveBeenCalled();
  });

  it('placeFromSavedData registers wall opening for door on wall mesh', () => {
    const { coord, buildingManager, sceneManager } = makeCoordinator();
    const wallMesh = new THREE.Object3D();
    wallMesh.position.set(5, 0, 5);
    buildingManager.getWallMesh.mockReturnValue(wallMesh);

    const doorMeta = baseAsset({
      category: AssetCategory.DOOR,
      gridUnits: { x: 1, z: 2 },
    });
    const po = placedObject({
      assetMetadata: doorMeta,
      wallAttachment: { wallId: 'wall-1', position: 0.4 },
    });

    coord.placeFromSavedData(po);

    expect(buildingManager.addWallOpening).toHaveBeenCalledWith(
      'wall-1',
      expect.objectContaining({
        id: `opening-${po.id}`,
        objectId: po.id,
        position: 0.4,
      })
    );
    expect(sceneManager.addObject).toHaveBeenCalledWith(po.id, expect.any(Object), po);
  });

  it('placeBatchNonGroundMesh removes replaced ground object id only via scene manager (batch semantics)', () => {
    const { coord, sceneManager, gridSystem } = makeCoordinator();
    gridSystem.markOccupied.mockReturnValue('old-ground');

    const po = placedObject();
    coord.placeBatchNonGroundMesh(po, po.assetMetadata);

    expect(sceneManager.removeObject).toHaveBeenCalledWith('old-ground');
  });
});
