import * as THREE from 'three';
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
    it('applies simulated state and routes visuals through applyVisualState', () => {
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
      const applyVisualState = jest.fn();

      updatePlacedObjectSimulationState('o1', sim, {
        getObject: () => group,
        getObjectData: () => po,
        applyVisualState,
        emitStateUpdated: jest.fn(),
      });

      expect(po.binding?.currentState).toBe(DeviceState.UNLOCKED);
      expect(applyVisualState).toHaveBeenCalledWith(group, po);
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
      const applyVisualState = jest.fn();

      updatePlacedObjectSimulationState('o1', sim, {
        getObject: () => new THREE.Group(),
        getObjectData: () => po,
        applyVisualState,
        emitStateUpdated: jest.fn(),
      });

      expect(po.binding?.currentState).toBe(DeviceState.LOCKED);
      expect(po.properties._originalState).toBeUndefined();
      expect(applyVisualState).toHaveBeenCalled();
    });
  });
});
