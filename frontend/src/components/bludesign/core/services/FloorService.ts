/**
 * Floor Service
 * 
 * Handles floor management operations including:
 * - Adding/removing floors
 * - Copying floor contents
 * - Floor visibility management
 * - Vertical shaft propagation
 * 
 * This service is part of the SOLID refactoring of BluDesignEngine.
 */

import * as THREE from 'three';
import { 
  AssetCategory, 
  AssetMetadata, 
  PlacedObject,
} from '../types';
import { Building, BuildingManager } from '../BuildingManager';
import { FloorManager } from '../FloorManager';
import { ObjectPlacementService } from './ObjectPlacementService';

export interface FloorContext {
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  placedObjects: Map<string, PlacedObject>;
  activeFloor: number;
  activeBuilding: Building | null;
}

export interface FloorOperationResult {
  success: boolean;
  floor?: number;
  error?: string;
}

export class FloorService {
  private context: FloorContext;
  private placementService?: ObjectPlacementService;
  
  constructor(context: FloorContext) {
    this.context = context;
  }
  
  /**
   * Update the context (called when engine state changes)
   */
  updateContext(updates: Partial<FloorContext>): void {
    this.context = { ...this.context, ...updates };
  }
  
  /**
   * Set the placement service (for vertical shaft propagation)
   */
  setPlacementService(service: ObjectPlacementService): void {
    this.placementService = service;
  }
  
  /**
   * Add a new floor above the current highest floor
   */
  addFloorAbove(copyFromFloor?: number): FloorOperationResult {
    const { buildingManager, activeBuilding, placedObjects } = this.context;
    
    if (!activeBuilding) {
      return { success: false, error: 'No building selected' };
    }
    
    const building = buildingManager.getBuilding(activeBuilding.id);
    if (!building) {
      return { success: false, error: 'Building not found' };
    }
    
    // Get current highest floor
    const maxFloor = Math.max(...building.floors.map(f => f.level));
    const newFloorLevel = maxFloor + 1;
    
    // Add the floor
    buildingManager.addFloor(building.id, newFloorLevel);
    
    // Copy contents if requested
    if (copyFromFloor !== undefined) {
      this.copyFloorContents(copyFromFloor, newFloorLevel);
    }
    
    // Add vertical shaft objects to new floor
    this.propagateVerticalShafts(building, newFloorLevel);
    
    return { success: true, floor: newFloorLevel };
  }
  
  /**
   * Add a new floor below the current lowest floor (basement)
   */
  addFloorBelow(copyFromFloor?: number): FloorOperationResult {
    const { buildingManager, activeBuilding, placedObjects } = this.context;
    
    if (!activeBuilding) {
      return { success: false, error: 'No building selected' };
    }
    
    const building = buildingManager.getBuilding(activeBuilding.id);
    if (!building) {
      return { success: false, error: 'Building not found' };
    }
    
    // Get current lowest floor
    const minFloor = Math.min(...building.floors.map(f => f.level));
    const newFloorLevel = minFloor - 1;
    
    // Add the floor
    buildingManager.addFloor(building.id, newFloorLevel);
    
    // Copy contents if requested
    if (copyFromFloor !== undefined) {
      this.copyFloorContents(copyFromFloor, newFloorLevel);
    }
    
    // Add vertical shaft objects to new floor
    this.propagateVerticalShafts(building, newFloorLevel);
    
    return { success: true, floor: newFloorLevel };
  }
  
  /**
   * Insert a floor between existing floors
   */
  insertFloor(level: number, copyFromFloor?: number): FloorOperationResult {
    const { buildingManager, activeBuilding } = this.context;
    
    if (!activeBuilding) {
      return { success: false, error: 'No building selected' };
    }
    
    const building = buildingManager.getBuilding(activeBuilding.id);
    if (!building) {
      return { success: false, error: 'Building not found' };
    }
    
    // Add the floor
    buildingManager.addFloor(building.id, level);
    
    // Copy contents if requested
    if (copyFromFloor !== undefined) {
      this.copyFloorContents(copyFromFloor, level);
    }
    
    // Add vertical shaft objects to new floor
    this.propagateVerticalShafts(building, level);
    
    return { success: true, floor: level };
  }
  
  /**
   * Delete a floor
   */
  deleteFloor(level: number): FloorOperationResult {
    const { buildingManager, activeBuilding, placedObjects } = this.context;
    
    if (!activeBuilding) {
      return { success: false, error: 'No building selected' };
    }
    
    const building = buildingManager.getBuilding(activeBuilding.id);
    if (!building) {
      return { success: false, error: 'Building not found' };
    }
    
    // Cannot delete if only one floor
    if (building.floors.length <= 1) {
      return { success: false, error: 'Cannot delete the only floor' };
    }
    
    // Delete objects on this floor
    const objectsToDelete = this.getObjectsOnFloor(level);
    for (const obj of objectsToDelete) {
      placedObjects.delete(obj.id);
    }
    
    // Delete the floor
    buildingManager.removeFloor(building.id, level);
    
    return { success: true, floor: level };
  }
  
  /**
   * Copy contents from one floor to another
   */
  copyFloorContents(sourceFloor: number, targetFloor: number): void {
    if (!this.placementService) {
      console.warn('PlacementService not set, cannot copy floor contents');
      return;
    }
    
    const sourceObjects = this.getObjectsOnFloor(sourceFloor);
    
    for (const obj of sourceObjects) {
      // Skip vertical shaft objects (they are handled separately)
      if (obj.assetMetadata?.spansAllFloors) {
        continue;
      }
      
      // Skip if no metadata
      if (!obj.assetMetadata) {
        continue;
      }
      
      // Place a copy on the target floor
      this.placementService.placeAsset(
        obj.assetMetadata,
        { ...obj.position },
        obj.rotation,
        targetFloor,
        obj.wallAttachment,
        obj.skinId
      );
    }
  }
  
  /**
   * Propagate vertical shaft objects (elevators, stairwells) to a new floor
   */
  private propagateVerticalShafts(building: Building, newFloorLevel: number): void {
    if (!this.placementService) {
      console.warn('PlacementService not set, cannot propagate vertical shafts');
      return;
    }
    
    // Find existing vertical shaft objects in the building
    const verticalShaftObjects = this.getVerticalShaftObjects(building);
    
    for (const obj of verticalShaftObjects) {
      // Check if already exists on this floor
      const existsOnFloor = this.getObjectsOnFloor(newFloorLevel).some(
        o => o.verticalShaftId === obj.verticalShaftId
      );
      
      if (existsOnFloor) {
        continue;
      }
      
      // Place on the new floor
      if (obj.assetMetadata) {
        this.placementService.placeAsset(
          obj.assetMetadata,
          { ...obj.position },
          obj.rotation,
          newFloorLevel,
          undefined,
          obj.skinId
        );
      }
    }
  }
  
  /**
   * Get objects on a specific floor
   */
  getObjectsOnFloor(floor: number): PlacedObject[] {
    return Array.from(this.context.placedObjects.values())
      .filter(obj => obj.floor === floor);
  }
  
  /**
   * Get vertical shaft objects for a building
   */
  private getVerticalShaftObjects(building: Building): PlacedObject[] {
    const { placedObjects } = this.context;
    
    return Array.from(placedObjects.values()).filter(obj => {
      // Check if it's a vertical shaft asset
      if (!obj.assetMetadata?.spansAllFloors) {
        return false;
      }
      
      // Check if it's inside this building
      return building.footprint.some(cell => 
        cell.x === obj.position.x && cell.z === obj.position.z
      );
    });
  }
  
  /**
   * Set the active floor for viewing/editing
   */
  setActiveFloor(floor: number): void {
    const { floorManager } = this.context;
    floorManager.setFloor(floor);
    this.context.activeFloor = floor;
  }
  
  /**
   * Get the current active floor
   */
  getActiveFloor(): number {
    return this.context.activeFloor;
  }
  
  /**
   * Get all floors for the active building
   */
  getFloors(): number[] {
    const { buildingManager, activeBuilding } = this.context;
    
    if (!activeBuilding) {
      return [0];
    }
    
    const building = buildingManager.getBuilding(activeBuilding.id);
    if (!building) {
      return [0];
    }
    
    return building.floors.map(f => f.level).sort((a, b) => a - b);
  }
}

