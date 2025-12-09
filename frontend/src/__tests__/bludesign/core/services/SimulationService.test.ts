/**
 * Simulation Service Tests
 * 
 * Tests for the data binding and simulation functionality.
 * These tests verify that state changes propagate correctly to visual representations.
 */

import { AssetCategory, DeviceState, PlacedObject, AssetMetadata } from '../../../../components/bludesign/core/types';
import { ObjectManagementService, ManagementContext } from '../../../../components/bludesign/core/services/ObjectManagementService';

// Mock THREE.js
jest.mock('three', () => ({
  Group: jest.fn().mockImplementation(() => ({
    traverse: jest.fn(),
    position: { x: 0, y: 0, z: 0 },
    rotation: { y: 0 },
    userData: {},
  })),
  Mesh: jest.fn(),
  MeshStandardMaterial: jest.fn().mockImplementation(() => ({
    color: { set: jest.fn(), setHex: jest.fn() },
    metalness: 0,
    roughness: 0,
    needsUpdate: false,
  })),
}));

// Mock AssetFactory
jest.mock('../../../../components/bludesign/assets/AssetFactory', () => ({
  AssetFactory: {
    updateAssetState: jest.fn(),
  },
}));

// Mock SkinRegistry
jest.mock('../../../../components/bludesign/core/SkinRegistry', () => ({
  getSkinRegistry: jest.fn(() => ({
    getSkin: jest.fn(),
  })),
}));

describe('ObjectManagementService - Simulation', () => {
  let service: ObjectManagementService;
  let mockContext: ManagementContext;
  let mockPlacedObjects: Map<string, PlacedObject>;
  
  const createMockAsset = (): AssetMetadata => ({
    id: 'test-unit',
    name: 'Test Unit',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 1, z: 1 },
    modelPath: '/models/test.glb',
    dimensions: { width: 1, height: 2, depth: 1 },
    isSmart: true,
  });
  
  const createMockPlacedObject = (id: string, isSmart: boolean = true): PlacedObject => ({
    id,
    assetId: 'test-unit',
    assetMetadata: createMockAsset(),
    position: { x: 0, z: 0 },
    rotation: 0,
    floor: 0,
    binding: isSmart ? {
      entityType: 'unit',
      currentState: DeviceState.LOCKED,
    } : undefined,
  });
  
  beforeEach(() => {
    mockPlacedObjects = new Map();
    
    mockContext = {
      scene: {} as any,
      sceneManager: {
        findObjectById: jest.fn().mockReturnValue({
          traverse: jest.fn(),
        }),
        removeObject: jest.fn(),
      } as any,
      buildingManager: {
        removeWallOpening: jest.fn(),
      } as any,
      groundTileManager: {
        removeTile: jest.fn(),
      } as any,
      placedObjects: mockPlacedObjects,
    };
    
    service = new ObjectManagementService(mockContext);
  });
  
  describe('simulateObjectState', () => {
    it('should update binding state for smart objects', () => {
      const placedObj = createMockPlacedObject('smart-obj-1');
      mockPlacedObjects.set('smart-obj-1', placedObj);
      
      const result = service.simulateObjectState('smart-obj-1', DeviceState.UNLOCKED);
      
      expect(result).toBe(true);
      expect(placedObj.binding?.currentState).toBe(DeviceState.UNLOCKED);
    });
    
    it('should return false for non-existent objects', () => {
      const result = service.simulateObjectState('non-existent', DeviceState.LOCKED);
      expect(result).toBe(false);
    });
    
    it('should return false for non-smart objects', () => {
      const placedObj = createMockPlacedObject('non-smart-obj');
      placedObj.binding = undefined; // Not smart
      mockPlacedObjects.set('non-smart-obj', placedObj);
      
      const result = service.simulateObjectState('non-smart-obj', DeviceState.LOCKED);
      expect(result).toBe(false);
    });
    
    it('should call AssetFactory.updateAssetState', () => {
      const { AssetFactory } = require('../../../../components/bludesign/assets/AssetFactory');
      const placedObj = createMockPlacedObject('smart-obj-2');
      mockPlacedObjects.set('smart-obj-2', placedObj);
      
      service.simulateObjectState('smart-obj-2', DeviceState.ERROR);
      
      expect(AssetFactory.updateAssetState).toHaveBeenCalled();
    });
    
    it('should handle all device states', () => {
      const states = [
        DeviceState.LOCKED,
        DeviceState.UNLOCKED,
        DeviceState.ERROR,
        DeviceState.MAINTENANCE,
        DeviceState.OFFLINE,
        DeviceState.UNKNOWN,
      ];
      
      const placedObj = createMockPlacedObject('multi-state-obj');
      mockPlacedObjects.set('multi-state-obj', placedObj);
      
      states.forEach(state => {
        const result = service.simulateObjectState('multi-state-obj', state);
        expect(result).toBe(true);
        expect(placedObj.binding?.currentState).toBe(state);
      });
    });
  });
  
  describe('State Persistence', () => {
    it('should persist state changes on placed objects', () => {
      const placedObj = createMockPlacedObject('persist-test');
      mockPlacedObjects.set('persist-test', placedObj);
      
      service.simulateObjectState('persist-test', DeviceState.MAINTENANCE);
      
      const retrieved = mockPlacedObjects.get('persist-test');
      expect(retrieved?.binding?.currentState).toBe(DeviceState.MAINTENANCE);
    });
  });
  
  describe('Integration with Skin System', () => {
    it('should update skin while preserving binding state', () => {
      const placedObj = createMockPlacedObject('skin-binding-test');
      mockPlacedObjects.set('skin-binding-test', placedObj);
      
      // Set initial state
      service.simulateObjectState('skin-binding-test', DeviceState.UNLOCKED);
      
      // Update skin
      service.updateObjectSkin('skin-binding-test', 'skin-unit-blue');
      
      // Binding should still be preserved
      expect(placedObj.binding?.currentState).toBe(DeviceState.UNLOCKED);
    });
  });
});

describe('Data Binding Edge Cases', () => {
  let service: ObjectManagementService;
  let mockPlacedObjects: Map<string, PlacedObject>;
  
  beforeEach(() => {
    mockPlacedObjects = new Map();
    
    service = new ObjectManagementService({
      scene: {} as any,
      sceneManager: {
        findObjectById: jest.fn().mockReturnValue(null), // Mesh not found
        removeObject: jest.fn(),
      } as any,
      buildingManager: {} as any,
      groundTileManager: {} as any,
      placedObjects: mockPlacedObjects,
    });
  });
  
  it('should handle missing mesh gracefully', () => {
    const placedObj: PlacedObject = {
      id: 'no-mesh-obj',
      assetId: 'test',
      position: { x: 0, z: 0 },
      rotation: 0,
      floor: 0,
      binding: {
        entityType: 'unit',
        currentState: DeviceState.LOCKED,
      },
    };
    mockPlacedObjects.set('no-mesh-obj', placedObj);
    
    // Should not throw even if mesh is not found
    expect(() => {
      service.simulateObjectState('no-mesh-obj', DeviceState.UNLOCKED);
    }).not.toThrow();
    
    // State should still be updated
    expect(placedObj.binding?.currentState).toBe(DeviceState.UNLOCKED);
  });
  
  it('should handle partial binding data', () => {
    const placedObj: PlacedObject = {
      id: 'partial-binding',
      assetId: 'test',
      position: { x: 0, z: 0 },
      rotation: 0,
      floor: 0,
      binding: {
        entityType: 'unit',
        // No entityId set
        currentState: DeviceState.UNKNOWN,
      },
    };
    mockPlacedObjects.set('partial-binding', placedObj);
    
    const result = service.simulateObjectState('partial-binding', DeviceState.LOCKED);
    expect(result).toBe(true);
  });
});

