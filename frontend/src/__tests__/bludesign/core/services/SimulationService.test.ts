/**
 * Simulation Service Tests
 * 
 * Tests for the data binding and simulation functionality.
 * These tests verify that state changes propagate correctly to visual representations.
 */

import { AssetCategory, DeviceState, PlacedObject, AssetMetadata, Orientation } from '../../../../components/bludesign/core/types';
import { ObjectManagementService, ManagementContext } from '../../../../components/bludesign/core/services/ObjectManagementService';

// Helper function for creating mock assets
const createMockAsset = (): AssetMetadata => ({
  id: 'test-unit',
  name: 'Test Unit',
  category: AssetCategory.STORAGE_UNIT,
  gridUnits: { x: 1, z: 1 },
  modelPath: '/models/test.glb',
  dimensions: { width: 1, height: 2, depth: 1 },
  isSmart: true,
  canRotate: true,
  canStack: false,
});

// Mock THREE.js
jest.mock('three', () => {
  const MockGroup = jest.fn().mockImplementation(function() {
    const instance = {
      traverse: jest.fn(),
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      userData: {},
    };
    // Set prototype to make instanceof work
    Object.setPrototypeOf(instance, MockGroup.prototype);
    return instance;
  });
  // Make MockGroup instances pass instanceof check
  MockGroup.prototype = Object.create(Object.prototype);
  MockGroup.prototype.constructor = MockGroup;
  
  return {
    Group: MockGroup,
    Mesh: jest.fn(),
    MeshStandardMaterial: jest.fn().mockImplementation(() => ({
      color: { set: jest.fn(), setHex: jest.fn() },
      metalness: 0,
      roughness: 0,
      needsUpdate: false,
    })),
  };
});

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
  
  const createMockPlacedObject = (id: string, isSmart: boolean = true): PlacedObject => ({
    id,
    assetId: 'test-unit',
    assetMetadata: createMockAsset(),
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    rotation: 0,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    binding: isSmart ? {
      entityType: 'unit',
      currentState: DeviceState.LOCKED,
    } : undefined,
  });
  
  beforeEach(() => {
    mockPlacedObjects = new Map();
    
    // Create a mock THREE.Group instance
    const THREE = require('three');
    const mockMesh = new THREE.Group();
    
    mockContext = {
      scene: {} as any,
      sceneManager: {
        getObject: jest.fn().mockReturnValue(mockMesh),
        getObjectData: jest.fn(),
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
      
      // Ensure getObject returns a THREE.Group instance
      // Use the same THREE instance that ObjectManagementService will use
      const THREE = require('three');
      const mockMesh = new THREE.Group();
      
      (mockContext.sceneManager.getObject as jest.Mock).mockReturnValue(mockMesh);
      
      // Reset the mock to clear any previous calls
      (AssetFactory.updateAssetState as jest.Mock).mockClear();
      
      service.simulateObjectState('smart-obj-2', DeviceState.ERROR);
      
      // Verify getObject was called
      expect(mockContext.sceneManager.getObject).toHaveBeenCalledWith('smart-obj-2');
      
      // Verify AssetFactory was called with the mesh and state
      // Note: The instanceof check in ObjectManagementService should pass because
      // both use the same mocked THREE.Group constructor
      expect(AssetFactory.updateAssetState).toHaveBeenCalled();
      expect(AssetFactory.updateAssetState).toHaveBeenCalledWith(mockMesh, DeviceState.ERROR);
    });
    
    it('should handle all device states', () => {
      // Ensure getObject returns a THREE.Group instance
      const THREE = require('three');
      const mockMesh = new THREE.Group();
      (mockContext.sceneManager.getObject as jest.Mock).mockReturnValue(mockMesh);
      
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
  let mockSceneManager: any;
  
  beforeEach(() => {
    mockPlacedObjects = new Map();
    
    // Create a mock THREE.Group instance
    const THREE = require('three');
    const mockMesh = new THREE.Group();
    
    mockSceneManager = {
      getObject: jest.fn().mockReturnValue(mockMesh),
      findObjectById: jest.fn().mockReturnValue(null), // Mesh not found
      removeObject: jest.fn(),
    };
    
    service = new ObjectManagementService({
      scene: {} as any,
      sceneManager: mockSceneManager as any,
      buildingManager: {} as any,
      groundTileManager: {} as any,
      placedObjects: mockPlacedObjects,
    });
  });
  
  it('should handle missing mesh gracefully', () => {
    const placedObj: PlacedObject = {
      id: 'no-mesh-obj',
      assetId: 'test',
      assetMetadata: createMockAsset(),
      position: { x: 0, z: 0, y: 0 },
      orientation: Orientation.NORTH,
      rotation: 0,
      canStack: false,
      floor: 0,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      binding: {
        entityType: 'unit',
        currentState: DeviceState.LOCKED,
      },
    };
    mockPlacedObjects.set('no-mesh-obj', placedObj);
    
    // Mock getObject to return undefined (no mesh found)
    mockSceneManager.getObject.mockReturnValue(undefined);
    
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
      assetMetadata: createMockAsset(),
      position: { x: 0, z: 0, y: 0 },
      orientation: Orientation.NORTH,
      rotation: 0,
      canStack: false,
      floor: 0,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      binding: {
        entityType: 'unit',
        // No entityId set
        currentState: DeviceState.UNKNOWN,
      },
    };
    mockPlacedObjects.set('partial-binding', placedObj);
    
    // Ensure getObject returns a THREE.Group instance
    const THREE = require('three');
    const mockMesh = new THREE.Group();
    mockSceneManager.getObject.mockReturnValue(mockMesh);
    
    const result = service.simulateObjectState('partial-binding', DeviceState.LOCKED);
    expect(result).toBe(true);
  });
});

