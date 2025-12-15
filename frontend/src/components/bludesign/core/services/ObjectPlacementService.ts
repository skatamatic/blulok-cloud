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
  Orientation,
  Building,
} from '../types';

type WallAttachment = PlacedObject['wallAttachment'];
import { SceneManager } from '../SceneManager';
import { BuildingManager } from '../BuildingManager';
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
    const { sceneManager, buildingManager, gridSize, buildings } = this.context;
    
    // Generate unique ID
    const id = `${asset.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Convert rotation (radians) to orientation (degrees)
    const rotationDegrees = (rotation * 180) / Math.PI;
    let orientation: Orientation = Orientation.NORTH;
    // Normalize to 0-360 range
    const normalizedDegrees = ((rotationDegrees % 360) + 360) % 360;
    if (normalizedDegrees >= 315 || normalizedDegrees < 45) {
      orientation = Orientation.NORTH;
    } else if (normalizedDegrees >= 45 && normalizedDegrees < 135) {
      orientation = Orientation.EAST;
    } else if (normalizedDegrees >= 135 && normalizedDegrees < 225) {
      orientation = Orientation.SOUTH;
    } else if (normalizedDegrees >= 225 && normalizedDegrees < 315) {
      orientation = Orientation.WEST;
    }
    
    // Create the placed object data
    const placedObject: PlacedObject = {
      id,
      assetId: asset.id,
      assetMetadata: asset,
      position,
      orientation,
      rotation,
      canStack: asset.canStack ?? false,
      floor,
      wallAttachment,
      skinId,
      binding: asset.isSmart ? { entityType: 'unit', currentState: DeviceState.LOCKED } : undefined,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
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
    const group = AssetFactory.createAssetMesh(asset);
    if (!group || !(group instanceof THREE.Group)) {
      return { success: false, error: `Failed to create asset mesh for ${asset.id}` };
    }
    
    // Calculate world position
    const worldX = position.x * gridSize;
    const worldZ = position.z * gridSize;
    let worldY = floor * 3; // Default floor height
    
    // For wall-attached objects, calculate proper position
    if (wallAttachment) {
      // Find building by checking which building has this wall
      const building = buildings.find(b => 
        b.walls.some(w => w.id === wallAttachment!.wallId)
      );
      if (building) {
        // Calculate position on wall
        const wallDirection = this.getWallDirection(wallAttachment.wallId, buildingManager);
        if (wallDirection) {
          // Position along wall based on attachment position
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
    sceneManager.addObject(placedObject.id, group, placedObject);
    
    return {
      success: true,
      placedObject,
      mesh: group,
    };
  }
  
  /**
   * Place a ground tile (uses instanced rendering)
   */
  private placeGroundTile(placedObject: PlacedObject, _asset: AssetMetadata): PlacementResult {
    const { groundTileManager, gridSize } = this.context;
    
    const worldX = placedObject.position.x * gridSize;
    const worldZ = placedObject.position.z * gridSize;
    
    groundTileManager.addTile(
      placedObject.id,
      _asset.category,
      { x: worldX, z: worldZ, y: 0 }
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
        const shaftId = `shaft-${position.x}-${position.z}`;
        result.placedObject.verticalShaftId = shaftId;
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
  validatePlacement(_asset: AssetMetadata, position: GridPosition, _floor: number): { valid: boolean; reason?: string } {
    const { buildings } = this.context;
    
    // Check if position is inside a building (for non-building assets)
    for (const building of buildings) {
      // Check if inside building (for future validation)
      void building.footprints.some(footprint =>
        position.x >= footprint.minX && position.x <= footprint.maxX &&
        position.z >= footprint.minZ && position.z <= footprint.maxZ
      );
      
      // Some assets can only be placed inside buildings
      // if (_asset.requiresBuilding && !isInsideBuilding) {
      //   return { valid: false, reason: 'This asset must be placed inside a building' };
      // }
      
      // Some assets can only be placed outside buildings
      // if (_asset.requiresOutdoor && isInsideBuilding) {
      //   return { valid: false, reason: 'This asset must be placed outside buildings' };
      // }
    }
    
    return { valid: true };
  }
}

