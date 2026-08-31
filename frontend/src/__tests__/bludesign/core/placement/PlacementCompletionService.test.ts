/**
 * Placement completion — asset placed flow and smart naming (mocked deps).
 */

import * as THREE from 'three';
import { PlacementCompletionService } from '../../../../components/bludesign/core/placement/PlacementCompletionService';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';

function asset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    id: 'door-1',
    name: 'Door',
    category: AssetCategory.DOOR,
    gridUnits: { x: 1, z: 1 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    ...overrides,
  } as AssetMetadata;
}

function placed(overrides: Partial<PlacedObject> = {}): PlacedObject {
  const a = asset();
  return {
    id: 'p1',
    assetId: a.id,
    name: '',
    position: { x: 0, z: 0 },
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

describe('PlacementCompletionService', () => {
  it('handleAssetPlaced assigns smart name and delegates to coordinator + history', () => {
    const placeInteractiveSingle = jest.fn();
    const pushPlace = jest.fn();
    const scheduleAutoSave = jest.fn();
    const emitObjectPlaced = jest.fn();
    const a = asset();

    const svc = new PlacementCompletionService({
      getStateSlice: () => ({ isFloorMode: true, buildings: [{ id: 'b' } as import('../../../../components/bludesign/core/types').Building] }),
      getCurrentPlacementAsset: () => a,
      setStateBuildings: jest.fn(),
      afterNewBuildingCreated: jest.fn(),
      cancelPlacement: jest.fn(),
      placementCoordinator: { placeInteractiveSingle } as never,
      scene: new THREE.Scene(),
      sceneManager: {} as never,
      gridSystem: {} as never,
      groundTileManager: {} as never,
      buildingManager: {} as never,
      floorManager: {} as never,
      actionHistory: { pushPlace } as never,
      emitObjectPlaced,
      emitProgressUpdated: jest.fn(),
      emitProgressComplete: jest.fn(),
      emitObjectsPlaced: jest.fn(),
      emitStateUpdated: jest.fn(),
      scheduleAutoSave,
    });

    const obj = placed({ name: '' });
    svc.handleAssetPlaced(obj);

    expect(obj.name).toMatch(/^Door \d+$/);
    expect(placeInteractiveSingle).toHaveBeenCalledWith(obj, a);
    expect(pushPlace).toHaveBeenCalledWith(obj);
    expect(emitObjectPlaced).toHaveBeenCalledWith(obj);
    expect(scheduleAutoSave).toHaveBeenCalled();
  });

  it('handleAssetPlaced blocks when not in floor mode with buildings', () => {
    const cancelPlacement = jest.fn();
    const svc = new PlacementCompletionService({
      getStateSlice: () => ({ isFloorMode: false, buildings: [{ id: 'b' } as import('../../../../components/bludesign/core/types').Building] }),
      getCurrentPlacementAsset: () => asset(),
      setStateBuildings: jest.fn(),
      afterNewBuildingCreated: jest.fn(),
      cancelPlacement,
      placementCoordinator: { placeInteractiveSingle: jest.fn() } as never,
      scene: new THREE.Scene(),
      sceneManager: {} as never,
      gridSystem: {} as never,
      groundTileManager: {} as never,
      buildingManager: {} as never,
      floorManager: {} as never,
      actionHistory: { pushPlace: jest.fn() } as never,
      emitObjectPlaced: jest.fn(),
      emitProgressUpdated: jest.fn(),
      emitProgressComplete: jest.fn(),
      emitObjectsPlaced: jest.fn(),
      emitStateUpdated: jest.fn(),
      scheduleAutoSave: jest.fn(),
    });

    svc.handleAssetPlaced(placed());
    expect(cancelPlacement).toHaveBeenCalled();
  });
});
