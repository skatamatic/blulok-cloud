/**
 * Serialization Service
 * 
 * Handles facility data import/export including:
 * - Scene state serialization
 * - Building data export
 * - Object data export/import
 * - Theme state management
 * 
 * This service is part of the SOLID refactoring of BluDesignEngine.
 */

import { 
  FacilityData, 
  PlacedObject, 
  DataSourceConfig,
  SerializedBuilding,
  SerializedPlacedObject,
  Building,
  CameraState,
  CameraMode,
  GridSize,
} from '../types';
import * as THREE from 'three';
import { BuildingManager } from '../BuildingManager';
import { ThemeManager } from '../ThemeManager';

export interface SerializationContext {
  buildingManager: BuildingManager;
  themeManager: ThemeManager;
  placedObjects: Map<string, PlacedObject>;
  activeFloor: number;
  isFloorMode: boolean;
}

// Use SerializedBuilding and SerializedPlacedObject from types.ts

export class SerializationService {
  private context: SerializationContext;
  
  constructor(context: SerializationContext) {
    this.context = context;
  }
  
  /**
   * Update the context (called when engine state changes)
   */
  updateContext(updates: Partial<SerializationContext>): void {
    this.context = { ...this.context, ...updates };
  }
  
  /**
   * Export the entire scene to FacilityData format
   */
  exportSceneData(
    name: string = 'Untitled Facility',
    dataSource?: DataSourceConfig
  ): FacilityData {
    const { buildingManager, themeManager, placedObjects, activeFloor } = this.context;
    
    // Export buildings
    const buildings = buildingManager.getAllBuildings().map(building => this.serializeBuilding(building));
    
    // Export placed objects
    const placedObjectsArray = Array.from(placedObjects.values()).map(obj => this.serializeObject(obj));
    
    // Export theme state
    const activeThemeId = themeManager.getActiveTheme().id;
    
    // Get current camera state (simplified - should be from context)
    const camera: CameraState = {
      mode: CameraMode.FREE,
      isometricAngle: 45,
      position: new THREE.Vector3(0, 0, 0),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1,
    };
    
    const data: FacilityData = {
      name,
      version: '1.0.0',
      camera,
      buildings,
      placedObjects: placedObjectsArray,
      activeFloor,
      activeSkins: {}, // Should be populated from context
      activeThemeId,
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    
    if (dataSource) {
      data.dataSource = dataSource;
    }
    
    return data;
  }
  
  /**
   * Serialize a building to export format
   */
  private serializeBuilding(building: Building): SerializedBuilding {
    return {
      id: building.id,
      name: building.name,
      footprints: [...building.footprints],
      floors: building.floors.map(f => ({ level: f.level, height: f.height })),
    };
  }
  
  /**
   * Serialize a placed object to export format
   */
  private serializeObject(obj: PlacedObject): SerializedPlacedObject {
    const serialized: SerializedPlacedObject = {
      id: obj.id,
      assetId: obj.assetId,
      position: { ...obj.position },
      orientation: obj.orientation,
      floor: obj.floor,
    };
    
    if (obj.buildingId) {
      serialized.buildingId = obj.buildingId;
    }
    
    if (obj.wallAttachment) {
      serialized.wallAttachment = {
        wallId: obj.wallAttachment.wallId,
        position: obj.wallAttachment.position,
      };
    }
    
    if (obj.name) {
      serialized.name = obj.name;
    }
    
    if (obj.binding) {
      serialized.binding = {
        entityType: obj.binding.entityType,
        entityId: obj.binding.entityId,
      };
    }
    
    return serialized;
  }
  
  /**
   * Import scene data from FacilityData format
   * Returns the parsed data that needs to be applied by the engine
   */
  parseImportData(data: FacilityData): {
    buildings: SerializedBuilding[];
    objects: SerializedPlacedObject[];
    activeThemeId?: string;
    viewState?: { activeFloor: number; isFloorMode: boolean };
    dataSource?: DataSourceConfig;
  } {
    return {
      buildings: data.buildings || [],
      objects: data.placedObjects || [],
      activeThemeId: data.activeThemeId,
      viewState: { activeFloor: data.activeFloor, isFloorMode: false },
      dataSource: data.dataSource,
    };
  }
  
  /**
   * Validate import data
   */
  validateImportData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data || typeof data !== 'object') {
      errors.push('Invalid data format: expected an object');
      return { valid: false, errors };
    }
    
    const facilityData = data as Partial<FacilityData>;
    
    // Validate buildings array
    if (facilityData.buildings && !Array.isArray(facilityData.buildings)) {
      errors.push('Invalid buildings format: expected an array');
    }
    
    // Validate placedObjects array
    if (facilityData.placedObjects && !Array.isArray(facilityData.placedObjects)) {
      errors.push('Invalid placedObjects format: expected an array');
    }
    
    // Validate each building
    if (Array.isArray(facilityData.buildings)) {
      facilityData.buildings.forEach((building, index) => {
        if (!building.id) {
          errors.push(`Building ${index}: missing id`);
        }
        if (!building.footprints || !Array.isArray(building.footprints)) {
          errors.push(`Building ${index}: invalid footprints`);
        }
      });
    }
    
    // Validate each object
    if (Array.isArray(facilityData.placedObjects)) {
      facilityData.placedObjects.forEach((obj, index) => {
        if (!obj.id) {
          errors.push(`Object ${index}: missing id`);
        }
        if (!obj.assetId) {
          errors.push(`Object ${index}: missing assetId`);
        }
        if (!obj.position || typeof obj.position.x !== 'number' || typeof obj.position.z !== 'number') {
          errors.push(`Object ${index}: invalid position`);
        }
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Create a snapshot of the current state for draft saving
   */
  createSnapshot(): string {
    const data = this.exportSceneData();
    return JSON.stringify(data);
  }
  
  /**
   * Restore from a snapshot string
   */
  parseSnapshot(snapshotJson: string): FacilityData | null {
    try {
      const data = JSON.parse(snapshotJson);
      const validation = this.validateImportData(data);
      if (!validation.valid) {
        console.warn('Invalid snapshot data:', validation.errors);
        return null;
      }
      return data as FacilityData;
    } catch (error) {
      console.error('Failed to parse snapshot:', error);
      return null;
    }
  }
  
  /**
   * Calculate approximate data size
   */
  calculateDataSize(data: FacilityData): number {
    return JSON.stringify(data).length;
  }
  
  /**
   * Get statistics about the facility data
   */
  getStatistics(): {
    buildingCount: number;
    objectCount: number;
    floorCount: number;
    dataSize: number;
  } {
    const { buildingManager, placedObjects } = this.context;
    
    const buildings = buildingManager.getAllBuildings();
    const totalFloors = buildings.reduce((sum, b) => sum + b.floors.length, 0);
    
    const data = this.exportSceneData();
    
    return {
      buildingCount: buildings.length,
      objectCount: placedObjects.size,
      floorCount: totalFloors,
      dataSize: this.calculateDataSize(data),
    };
  }
}

