import * as THREE from 'three';
import { AssetFactory } from '../../../../components/bludesign/assets/AssetFactory';
import {
  updatePlacedObjectBinding,
  updatePlacedObjectSimulationState,
} from '../../../../components/bludesign/core/placedObject/placedObjectPropertyUpdates';
import {
  DeviceState,
  Orientation,
  type EntityBinding,
  type PlacedObject,
  type SimulationState,
} from '../../../../components/bludesign/core/types';

function placed(overrides: Partial<PlacedObject>): PlacedObject {
  return {
    id: 'o1',
    assetId: 'a1',
    name: 'O',
    position: { x: 0, z: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: { isSmart: true } as PlacedObject['assetMetadata'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('placedObjectPropertyUpdates', () => {
  describe('updatePlacedObjectBinding', () => {
    it('maps gate binding to device entity type', () => {
      const po = placed({ binding: undefined });
      const binding: EntityBinding = {
        entityType: 'gate',
        entityId: 'g1',
      };
      const emitStateUpdated = jest.fn();

      updatePlacedObjectBinding('o1', binding, {
        getObject: () => new THREE.Object3D(),
        getObjectData: () => po,
        emitStateUpdated,
      });

      expect(po.binding?.entityType).toBe('device');
      expect(po.binding?.entityId).toBe('g1');
      expect(emitStateUpdated).toHaveBeenCalled();
    });

    it('clears binding when undefined', () => {
      const po = placed({
        binding: {
          entityType: 'unit',
          entityId: 'u1',
          currentState: DeviceState.UNKNOWN,
        },
      });
      updatePlacedObjectBinding('o1', undefined, {
        getObject: () => new THREE.Object3D(),
        getObjectData: () => po,
        emitStateUpdated: jest.fn(),
      });
      expect(po.binding).toBeUndefined();
    });
  });

  describe('updatePlacedObjectSimulationState', () => {
    const updateSpy = jest.spyOn(AssetFactory, 'updateAssetState');

    beforeEach(() => {
      updateSpy.mockImplementation(() => {});
    });

    afterAll(() => {
      updateSpy.mockRestore();
    });

    it('applies simulated state and calls AssetFactory when simulating', () => {
      const po = placed({
        binding: {
          entityType: 'unit',
          entityId: 'u1',
          currentState: DeviceState.LOCKED,
        },
      });
      const sim: SimulationState = {
        isSimulating: true,
        simulatedState: DeviceState.UNLOCKED,
      };
      const group = new THREE.Group();

      updatePlacedObjectSimulationState('o1', sim, {
        getObject: () => group,
        getObjectData: () => po,
        emitStateUpdated: jest.fn(),
      });

      expect(po.binding?.currentState).toBe(DeviceState.UNLOCKED);
      expect(updateSpy).toHaveBeenCalledWith(group, DeviceState.UNLOCKED);
    });

    it('restores original state when simulation ends', () => {
      const po = placed({
        binding: {
          entityType: 'unit',
          entityId: 'u1',
          currentState: DeviceState.UNLOCKED,
        },
        properties: { _originalState: DeviceState.LOCKED },
      });
      const sim: SimulationState = { isSimulating: false };

      updatePlacedObjectSimulationState('o1', sim, {
        getObject: () => new THREE.Group(),
        getObjectData: () => po,
        emitStateUpdated: jest.fn(),
      });

      expect(po.binding?.currentState).toBe(DeviceState.LOCKED);
      expect(po.properties._originalState).toBeUndefined();
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});
