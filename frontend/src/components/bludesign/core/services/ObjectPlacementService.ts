/**
 * Object Placement Service
 * 
 * Handles all object placement operations including:
 * - Single asset placement
 * - Batch placement
 * - Vertical shaft (elevator/stairwell) multi-floor placement
 * - Ground tile placement
 * 
 * This service is part of the SOLID refactoring of BluDesignEngine.
 */

import * as THREE from 'three';
import { 
  AssetCategory, 
  AssetMetadata, 
  GridPosition, 
  PlacedObject, 
  DeviceState,
  WallAttachment,
} from '../types';
import { SceneManager } from '../SceneManager';
import { BuildingManager, Building } from '../BuildingManager';
import { FloorManager } from '../FloorManager';
import { GroundTileManager } from '../GroundTileManager';
import { AssetFactory } from '../../assets/AssetFactory';

export interface PlacementContext {
  scene: THREE.Scene;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  groundTileManager: GroundTileManager;
  gridSize: number;
  activeFloor: number;
  buildings: Building[];
}

export interface PlacementResult {
  success: boolean;
  placedObject?: PlacedObject;
  mesh?: THREE.Group;
  error?: string;
}

export class ObjectPlacementService {
  private context: PlacementContext;
  
  constructor(context: PlacementContext) {
    this.context = context;
  }
  
  /**
   * Update the context (called when engine state changes)
   */
  updateContext(updates: Partial<PlacementContext>): void {
    this.context = { ...this.context, ...updates };
  }
  
  /**
   * Place a single asset at a grid position
   */
  placeAsset(
    asset: AssetMetadata,
    position: GridPosition,
    rotation: number = 0,
    floor: number = 0,
    wallAttachment?: WallAttachment,
    skinId?: string
  ): PlacementResult {
    const { sceneManager, buildingManager, groundTileManager, gridSize, buildings } = this.context;
    
    // Generate unique ID
    const id = `${asset.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the placed object data
    const placedObject: PlacedObject = {
      id,
      assetId: asset.id,
      assetMetadata: asset,
      position,
      rotation,
      floor,
      wallAttachment,
      skinId,
      binding: asset.isSmart ? { entityType: 'unit', currentState: DeviceState.LOCKED } : undefined,
    };
    
    // Check if this is a ground tile category
    const isGroundTile = [
      AssetCategory.PAVEMENT,
      AssetCategory.GRASS,
      AssetCategory.GRAVEL
    ].includes(asset.category);
    
    if (isGroundTile) {
      return this.placeGroundTile(placedObject, asset);
    }
    
    // Create the 3D mesh
    const group = AssetFactory.createAsset(asset.id, asset);
    if (!group) {
      return { success: false, error: `Failed to create asset mesh for ${asset.id}` };
    }
    
    // Calculate world position
    const worldX = position.x * gridSize;
    const worldZ = position.z * gridSize;
    let worldY = floor * 3; // Default floor height
    
    // For wall-attached objects, calculate proper position
    if (wallAttachment) {
      const building = buildings.find(b => b.id === wallAttachment.buildingId);
      if (building) {
        // Calculate position on wall
        const wallDirection = this.getWallDirection(wallAttachment.wallId, buildingManager);
        if (wallDirection) {
          // Position along wall based on attachment position
          const wallLength = 1; // Simplified
          const attachPos = wallAttachment.position * wallLength;
          // Apply wall-relative positioning
        }
      }
    }
    
    // Position the mesh
    group.position.set(worldX, worldY, worldZ);
    group.rotation.y = rotation;
    
    // Set user data for identification
    group.userData = {
      id: placedObject.id,
      assetId: asset.id,
      category: asset.category,
      isSmart: asset.isSmart,
      gridPosition: position,
      floor,
    };
    
    // Add to scene
    sceneManager.addObject(group);
    
    return {
      success: true,
      placedObject,
      mesh: group,
    };
  }
  
  /**
   * Place a ground tile (uses instanced rendering)
   */
  private placeGroundTile(placedObject: PlacedObject, asset: AssetMetadata): PlacementResult {
    const { groundTileManager, gridSize } = this.context;
    
    const worldX = placedObject.position.x * gridSize;
    const worldZ = placedObject.position.z * gridSize;
    
    // Get default material for this category
    const material = new THREE.MeshStandardMaterial({
      color: asset.category === AssetCategory.GRASS ? 0x3d7a3d :
             asset.category === AssetCategory.PAVEMENT ? 0x505860 : 0xa8957a,
      roughness: 0.85,
      metalness: 0.02,
    });
    
    groundTileManager.addTile(
      placedObject.id,
      asset.category,
      { x: worldX, z: worldZ },
      material
    );
    
    return {
      success: true,
      placedObject,
    };
  }
  
  /**
   * Place objects for vertical shafts (elevators, stairwells) on all floors
   */
  placeVerticalShaft(
    asset: AssetMetadata,
    position: GridPosition,
    rotation: number,
    building: Building
  ): PlacementResult[] {
    const results: PlacementResult[] = [];
    
    // Get all floors for this building
    const floorCount = building.floors.length;
    
    for (let floorLevel = 0; floorLevel < floorCount; floorLevel++) {
      const result = this.placeAsset(asset, position, rotation, floorLevel);
      
      if (result.success && result.placedObject) {
        // Mark as part of vertical shaft
        result.placedObject.verticalShaftId = `shaft-${position.x}-${position.z}`;
      }
      
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Get wall direction for wall-attached objects
   */
  private getWallDirection(wallId: string, buildingManager: BuildingManager): THREE.Vector3 | null {
    const wall = buildingManager.getWall(wallId);
    if (!wall) return null;
    
    const dx = wall.endPos.x - wall.startPos.x;
    const dz = wall.endPos.z - wall.startPos.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    
    if (length === 0) return null;
    
    return new THREE.Vector3(dx / length, 0, dz / length);
  }
  
  /**
   * Validate placement position
   */
  validatePlacement(asset: AssetMetadata, position: GridPosition, floor: number): { valid: boolean; reason?: string } {
    const { buildings } = this.context;
    
    // Check if position is inside a building (for non-building assets)
    for (const building of buildings) {
      const isInsideBuilding = building.footprint.some(cell => 
        cell.x === position.x && cell.z === position.z
      );
      
      // Some assets can only be placed inside buildings
      if (asset.requiresBuilding && !isInsideBuilding) {
        return { valid: false, reason: 'This asset must be placed inside a building' };
      }
      
      // Some assets can only be placed outside buildings
      if (asset.requiresOutdoor && isInsideBuilding) {
        return { valid: false, reason: 'This asset must be placed outside buildings' };
      }
    }
    
    return { valid: true };
  }
}

