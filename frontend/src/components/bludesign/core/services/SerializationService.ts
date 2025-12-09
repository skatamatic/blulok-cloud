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
  GridPosition,
  DataSourceConfig,
} from '../types';
import { Building, BuildingManager } from '../BuildingManager';
import { Theme, ThemeManager } from '../ThemeManager';

export interface SerializationContext {
  buildingManager: BuildingManager;
  themeManager: ThemeManager;
  placedObjects: Map<string, PlacedObject>;
  activeFloor: number;
  isFloorMode: boolean;
}

export interface SerializedBuilding {
  id: string;
  footprint: GridPosition[];
  floors: number[];
  skin?: string;
}

export interface SerializedObject {
  id: string;
  assetId: string;
  position: GridPosition;
  rotation: number;
  floor: number;
  wallAttachment?: {
    buildingId: string;
    wallId: string;
    position: number;
  };
  name?: string;
  skinId?: string;
  binding?: {
    entityType: string;
    entityId?: string;
    currentState: string;
  };
  disableVerticalShaft?: boolean;
}

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
    const { buildingManager, themeManager, placedObjects, activeFloor, isFloorMode } = this.context;
    
    // Export buildings
    const buildings = buildingManager.getAllBuildings().map(building => this.serializeBuilding(building));
    
    // Export placed objects
    const objects = Array.from(placedObjects.values()).map(obj => this.serializeObject(obj));
    
    // Export theme state
    const activeThemeId = themeManager.getActiveTheme().id;
    
    const data: FacilityData = {
      name,
      buildings,
      objects,
      activeThemeId,
      viewState: {
        activeFloor,
        isFloorMode,
      },
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
      footprint: [...building.footprint],
      floors: building.floors.map(f => f.level),
      skin: building.skin,
    };
  }
  
  /**
   * Serialize a placed object to export format
   */
  private serializeObject(obj: PlacedObject): SerializedObject {
    const serialized: SerializedObject = {
      id: obj.id,
      assetId: obj.assetId,
      position: { ...obj.position },
      rotation: obj.rotation,
      floor: obj.floor,
    };
    
    if (obj.wallAttachment) {
      serialized.wallAttachment = {
        buildingId: obj.wallAttachment.buildingId,
        wallId: obj.wallAttachment.wallId,
        position: obj.wallAttachment.position,
      };
    }
    
    if (obj.name) {
      serialized.name = obj.name;
    }
    
    if (obj.skinId) {
      serialized.skinId = obj.skinId;
    }
    
    if (obj.binding) {
      serialized.binding = {
        entityType: obj.binding.entityType,
        entityId: obj.binding.entityId,
        currentState: obj.binding.currentState,
      };
    }
    
    if (obj.disableVerticalShaft) {
      serialized.disableVerticalShaft = true;
    }
    
    return serialized;
  }
  
  /**
   * Import scene data from FacilityData format
   * Returns the parsed data that needs to be applied by the engine
   */
  parseImportData(data: FacilityData): {
    buildings: SerializedBuilding[];
    objects: SerializedObject[];
    activeThemeId?: string;
    viewState?: { activeFloor: number; isFloorMode: boolean };
    dataSource?: DataSourceConfig;
  } {
    return {
      buildings: data.buildings || [],
      objects: data.objects || [],
      activeThemeId: data.activeThemeId,
      viewState: data.viewState,
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
    
    // Validate objects array
    if (facilityData.objects && !Array.isArray(facilityData.objects)) {
      errors.push('Invalid objects format: expected an array');
    }
    
    // Validate each building
    if (Array.isArray(facilityData.buildings)) {
      facilityData.buildings.forEach((building, index) => {
        if (!building.id) {
          errors.push(`Building ${index}: missing id`);
        }
        if (!building.footprint || !Array.isArray(building.footprint)) {
          errors.push(`Building ${index}: invalid footprint`);
        }
      });
    }
    
    // Validate each object
    if (Array.isArray(facilityData.objects)) {
      facilityData.objects.forEach((obj, index) => {
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

