/**
 * Batch asset placement — ground vs non-ground paths and completion wiring (mocked OptimizationManager + deps).
 */

import * as THREE from 'three';
import { runBatchAssetPlacement } from '../../../../components/bludesign/core/placement/batchAssetPlacement';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';

const mockOpt = {
  isEnabled: jest.fn(() => false),
  willShowOptimizationProgress: jest.fn(() => false),
};

jest.mock('../../../../components/bludesign/core/OptimizationManager', () => ({
  OptimizationManager: {
    getInstance: jest.fn(() => mockOpt),
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
    position: { x: 0, z: 0 },
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

describe('runBatchAssetPlacement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpt.isEnabled.mockReturnValue(false);
    mockOpt.willShowOptimizationProgress.mockReturnValue(false);
  });

  it('no-ops when objects array is empty', async () => {
    const pushBatchPlace = jest.fn();
    await runBatchAssetPlacement([], baseAsset(), {
      groundTileManager: {
        isGroundTileCategory: jest.fn(),
        getTileIds: jest.fn(() => []),
        addTilesBatch: jest.fn(() => []),
        removeTile: jest.fn(),
      },
      sceneManager: { addObject: jest.fn(), removeObject: jest.fn() },
      gridSystem: { markOccupied: jest.fn(() => null) },
      placementCoordinator: { placeBatchNonGroundMesh: jest.fn() },
      scene: new THREE.Scene(),
      actionHistory: { pushBatchPlace },
      emitProgressUpdated: jest.fn(),
      emitProgressComplete: jest.fn(),
      emitObjectsPlaced: jest.fn(),
      scheduleAutoSave: jest.fn(),
    });
    expect(pushBatchPlace).not.toHaveBeenCalled();
  });

  it('places ground tiles via addTilesBatch, grid, scene, then history + events', async () => {
    const marker = new THREE.Object3D();
    const ground = placedObject({
      id: 'g1',
      assetMetadata: baseAsset({ category: AssetCategory.GRASS }),
    });
    const asset = baseAsset({ category: AssetCategory.GRASS });

    const addTilesBatch = jest.fn(() => [marker]);
    const markOccupied = jest.fn(() => null);
    const pushBatchPlace = jest.fn();
    const emitObjectsPlaced = jest.fn();
    const scheduleAutoSave = jest.fn();
    const addObject = jest.fn();
    const scene = new THREE.Scene();

    await runBatchAssetPlacement([ground], asset, {
      groundTileManager: {
        isGroundTileCategory: jest.fn(() => true),
        getTileIds: jest.fn(() => []),
        addTilesBatch,
        removeTile: jest.fn(),
      },
      sceneManager: { addObject, removeObject: jest.fn() },
      gridSystem: { markOccupied },
      placementCoordinator: { placeBatchNonGroundMesh: jest.fn() },
      scene,
      actionHistory: { pushBatchPlace },
      emitProgressUpdated: jest.fn(),
      emitProgressComplete: jest.fn(),
      emitObjectsPlaced,
      scheduleAutoSave,
    });

    expect(addTilesBatch).toHaveBeenCalledWith([
      { objectId: 'g1', category: AssetCategory.GRASS, position: { x: 0, z: 0 } },
    ]);
    expect(addObject).toHaveBeenCalledWith('g1', marker, ground, { trackOnly: true });
    expect(markOccupied).toHaveBeenCalled();
    expect(scene.children).not.toContain(marker);
    expect(pushBatchPlace).toHaveBeenCalledWith([ground]);
    expect(emitObjectsPlaced).toHaveBeenCalledWith([ground]);
    expect(scheduleAutoSave).toHaveBeenCalled();
  });

  it('routes non-ground objects through placeBatchNonGroundMesh', async () => {
    const obj = placedObject({ id: 'o1' });
    const asset = baseAsset();
    const placeBatchNonGroundMesh = jest.fn();

    await runBatchAssetPlacement([obj], asset, {
      groundTileManager: {
        isGroundTileCategory: jest.fn(() => false),
        getTileIds: jest.fn(() => []),
        addTilesBatch: jest.fn(() => []),
        removeTile: jest.fn(),
      },
      sceneManager: { addObject: jest.fn(), removeObject: jest.fn() },
      gridSystem: { markOccupied: jest.fn(() => null) },
      placementCoordinator: { placeBatchNonGroundMesh },
      scene: new THREE.Scene(),
      actionHistory: { pushBatchPlace: jest.fn() },
      emitProgressUpdated: jest.fn(),
      emitProgressComplete: jest.fn(),
      emitObjectsPlaced: jest.fn(),
      scheduleAutoSave: jest.fn(),
    });

    expect(placeBatchNonGroundMesh).toHaveBeenCalledWith(obj, asset);
  });

  it('when progress is shown and optimization will not report progress, completes and schedules progress-complete', async () => {
    jest.useFakeTimers();
    const tiles: PlacedObject[] = [
      placedObject({
        id: 'g0',
        assetMetadata: baseAsset({ id: 'a0', category: AssetCategory.GRASS }),
      }),
      placedObject({
        id: 'g1',
        assetMetadata: baseAsset({ id: 'a1', category: AssetCategory.GRASS }),
      }),
    ];
    const asset = baseAsset({ category: AssetCategory.GRASS });
    const emitProgressUpdated = jest.fn();
    const emitProgressComplete = jest.fn();

    mockOpt.isEnabled.mockReturnValue(true);
    mockOpt.willShowOptimizationProgress.mockReturnValue(false);

    const markers = tiles.map(() => new THREE.Object3D());
    const p = runBatchAssetPlacement(tiles, asset, {
      groundTileManager: {
        isGroundTileCategory: jest.fn(() => true),
        getTileIds: jest.fn(() => Array.from({ length: 499 }, (_, i) => `existing-${i}`)),
        addTilesBatch: jest.fn(() => markers),
        removeTile: jest.fn(),
      },
      sceneManager: { addObject: jest.fn(), removeObject: jest.fn() },
      gridSystem: { markOccupied: jest.fn(() => null) },
      placementCoordinator: { placeBatchNonGroundMesh: jest.fn() },
      scene: new THREE.Scene(),
      actionHistory: { pushBatchPlace: jest.fn() },
      emitProgressUpdated,
      emitProgressComplete,
      emitObjectsPlaced: jest.fn(),
      scheduleAutoSave: jest.fn(),
    });

    await p;
    expect(emitProgressUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ percentage: 100, message: 'Complete' })
    );
    expect(emitProgressComplete).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(emitProgressComplete).toHaveBeenCalledWith({ operation: 'processing' });
    jest.useRealTimers();
  });
});
