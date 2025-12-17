/**
 * Building Manager Optimizer Integration Tests
 * 
 * Tests the integration of the geometry optimizer into BuildingManager.
 */

import { BuildingManager } from '@/components/bludesign/core/BuildingManager';
import { GridSystem } from '@/components/bludesign/core/GridSystem';
import { AssetFactory } from '@/components/bludesign/assets/AssetFactory';
import { Building, BuildingFootprint, Floor, FLOOR_HEIGHT } from '@/components/bludesign/core/types';
import * as THREE from 'three';

// Mock scene
const mockScene = new THREE.Scene();
const mockGridSystem = new GridSystem(mockScene);
const mockCallbacks = {
  onBuildingCreated: jest.fn(),
  onBuildingsMerged: jest.fn(),
  onBuildingDeleted: jest.fn(),
  onBuildingModified: jest.fn(),
  onWallCreated: jest.fn(),
  onFloorTileCreated: jest.fn(),
};

describe('BuildingManager Optimizer Integration', () => {
  let manager: BuildingManager;
  
  beforeEach(() => {
    manager = new BuildingManager(mockScene, mockGridSystem, AssetFactory, mockCallbacks);
  });
  
  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });
  
  it('should use optimizer when enabled', () => {
    manager.setOptimizerEnabled(true);
    
    const building: Building = {
      id: 'test-building',
      name: 'Test Building',
      footprints: [{ minX: 0, maxX: 9, minZ: 0, maxZ: 9 }],
      floors: [{ level: 0, height: FLOOR_HEIGHT, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Create building
    manager['buildings'].set(building.id, building);
    
    // Generate floor tiles (should use optimizer)
    manager['generateFloorTiles'](building, 0);
    
    // Should have created optimization
    const optimization = manager['floorOptimizations'].get(0);
    expect(optimization).toBeDefined();
    expect(optimization!.rectangles.length).toBe(1); // 10x10 should be single rectangle
    expect(optimization!.rectangles[0].area).toBe(100);
  });
  
  it('should fall back to per-cell rendering when optimizer disabled', () => {
    manager.setOptimizerEnabled(false);
    
    const building: Building = {
      id: 'test-building',
      name: 'Test Building',
      footprints: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }],
      floors: [{ level: 0, height: FLOOR_HEIGHT, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    manager['buildings'].set(building.id, building);
    manager['generateFloorTiles'](building, 0);
    
    // Should not have optimization
    const optimization = manager['floorOptimizations'].get(0);
    expect(optimization).toBeUndefined();
    
    // Should have created individual tiles
    expect(building.floors[0].groundTileIds.length).toBe(9); // 3x3 = 9 tiles
  });
  
  it('should invalidate optimizations when building changes', () => {
    manager.setOptimizerEnabled(true);
    
    const building: Building = {
      id: 'test-building',
      name: 'Test Building',
      footprints: [{ minX: 0, maxX: 4, minZ: 0, maxZ: 4 }],
      floors: [{ level: 0, height: FLOOR_HEIGHT, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    manager['buildings'].set(building.id, building);
    manager['generateFloorTiles'](building, 0);
    
    // Should have optimization
    expect(manager['floorOptimizations'].has(0)).toBe(true);
    
    // Modify building
    building.footprints[0].maxX = 9;
    manager['generateFloorTiles'](building, 0);
    
    // Should have new optimization
    const optimization = manager['floorOptimizations'].get(0);
    expect(optimization).toBeDefined();
    expect(optimization!.rectangles[0].area).toBe(50); // 10x5 rectangle
  });
  
  it('should always create markers for selection regardless of optimization', () => {
    manager.setOptimizerEnabled(true);
    
    const building: Building = {
      id: 'test-building',
      name: 'Test Building',
      footprints: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }],
      floors: [{ level: 0, height: FLOOR_HEIGHT, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    manager['buildings'].set(building.id, building);
    manager['generateFloorTiles'](building, 0);
    
    // Should have markers for all cells (9 cells)
    expect(building.floors[0].groundTileIds.length).toBe(9);
    expect(manager['floorTileMeshes'].size).toBe(9);
  });
  
  it('should respect readonly mode for optimization', () => {
    manager.setOptimizerEnabled(true);
    manager.setReadonlyMode(true);
    
    const building: Building = {
      id: 'test-building',
      name: 'Test Building',
      footprints: [{ minX: 0, maxX: 9, maxZ: 9, minZ: 0 }],
      floors: [{ level: 0, height: FLOOR_HEIGHT, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    manager['buildings'].set(building.id, building);
    manager['generateFloorTiles'](building, 0);
    
    // In readonly mode, should allow larger rectangles (no maxRectangleSize limit)
    const optimization = manager['floorOptimizations'].get(0);
    expect(optimization).toBeDefined();
    expect(optimization!.rectangles.length).toBe(1); // Should merge into single rectangle
  });
});
