import * as THREE from 'three';
import {
  applyRotationState,
  moveObjectInternal,
} from '../../../../components/bludesign/core/placement/objectTransformApply';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';

function asset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    id: 'a1',
    name: 'A',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 2, z: 3 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    ...overrides,
  } as AssetMetadata;
}

describe('objectTransformApply', () => {
  it('moveObjectInternal updates mesh, placed object, and grid occupancy', () => {
    const meta = asset();
    const placed: PlacedObject = {
      id: 'o1',
      assetId: meta.id,
      position: { x: 0, z: 0 },
      orientation: Orientation.NORTH,
      canStack: false,
      floor: 0,
      properties: {},
      assetMetadata: meta,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mesh = new THREE.Object3D();
    mesh.userData.internalXOffset = 0;
    mesh.userData.internalYOffset = 0.1;
    mesh.userData.internalZOffset = 0;

    const clearOccupied = jest.fn();
    const markOccupied = jest.fn(() => null as string | null);
    const gridToWorld = jest.fn(() => new THREE.Vector3(10, 0, 20));
    const getFootprintCenterWorld = jest.fn((anchor: { x: number; z: number; y?: number }, fp: { x: number; z: number }) =>
      gridToWorld({
        x: anchor.x + fp.x / 2,
        z: anchor.z + fp.z / 2,
        y: anchor.y,
      })
    );

    moveObjectInternal('o1', { x: 5, z: 7, y: 0 }, Orientation.EAST, undefined, undefined, {
      sceneManager: {
        getObjectData: () => placed,
        getObject: () => mesh,
      },
      gridSystem: {
        clearOccupied,
        getGridSize: () => 1,
        gridToWorld,
        getFootprintCenterWorld,
        markOccupied,
      },
    });

    expect(clearOccupied).toHaveBeenCalledWith('o1');
    expect(placed.position.x).toBe(5);
    expect(placed.position.z).toBe(7);
    expect(placed.orientation).toBe(Orientation.EAST);
    expect(markOccupied).toHaveBeenCalled();
  });

  it('applyRotationState restores state and invokes onComplete', () => {
    const meta = asset();
    const placed: PlacedObject = {
      id: 'o1',
      assetId: meta.id,
      position: { x: 1, z: 2 },
      orientation: Orientation.NORTH,
      canStack: false,
      floor: 0,
      properties: {},
      assetMetadata: meta,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mesh = new THREE.Object3D();
    mesh.userData.internalYOffset = 0;

    const clearOccupied = jest.fn();
    const markOccupied = jest.fn();
    const gridToWorld = jest.fn(() => new THREE.Vector3(0, 0, 0));
    const getFootprintCenterWorld = jest.fn((anchor: { x: number; z: number; y?: number }, fp: { x: number; z: number }) =>
      gridToWorld({
        x: anchor.x + fp.x / 2,
        z: anchor.z + fp.z / 2,
        y: anchor.y,
      })
    );
    const onComplete = jest.fn();

    const states = new Map([
      [
        'o1',
        {
          position: { x: 2, z: 3, y: 0 },
          rotation: 0.5,
          orientation: Orientation.SOUTH,
        },
      ],
    ]);

    applyRotationState(states, {
      sceneManager: {
        getObjectData: () => placed,
        getObject: () => mesh,
      },
      gridSystem: {
        clearOccupied,
        gridToWorld,
        getGridSize: () => 1,
        getFootprintCenterWorld,
        markOccupied,
      },
      floorManager: {
        getCurrentFloorY: () => 0,
      },
      onComplete,
    });

    expect(placed.orientation).toBe(Orientation.SOUTH);
    expect(placed.rotation).toBe(0.5);
    expect(mesh.rotation.y).toBe(0.5);
    expect(onComplete).toHaveBeenCalled();
  });
});
