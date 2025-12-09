/**
 * Clipboard Manager
 * 
 * Manages copy/cut/paste operations for placed objects in the editor.
 */

import { PlacedObject, GridPosition, Orientation, AssetMetadata, Building, BuildingFootprint } from './types';

export interface ClipboardBuilding {
  footprints: BuildingFootprint[];
  floors: { level: number; height: number }[];
  name?: string;
}

export interface ClipboardData {
  objects: PlacedObject[];
  buildings: ClipboardBuilding[];
  centerOffset: GridPosition; // Offset from center of selection
  copiedAt: number;
}

export class ClipboardManager {
  private clipboardData: ClipboardData | null = null;
  
  /**
   * Copy objects to clipboard
   */
  copy(objects: PlacedObject[], buildings: Building[] = []): void {
    if (objects.length === 0 && buildings.length === 0) return;
    
    // Calculate center of selection (including buildings)
    const center = this.calculateCenter(objects, buildings);
    
    // Store deep copies with relative positions
    this.clipboardData = {
      objects: objects.map(obj => this.cloneObject(obj)),
      buildings: buildings.map(b => this.cloneBuilding(b)),
      centerOffset: center,
      copiedAt: Date.now(),
    };
  }
  
  /**
   * Check if clipboard has content
   */
  hasContent(): boolean {
    return this.clipboardData !== null && this.clipboardData.objects.length > 0;
  }
  
  /**
   * Get clipboard objects count
   */
  getCount(): number {
    return this.clipboardData?.objects.length ?? 0;
  }
  
  /**
   * Paste objects at target position
   * Returns new objects with new IDs, ready to be placed
   */
  paste(targetPosition: GridPosition): PlacedObject[] | null {
    if (!this.clipboardData || this.clipboardData.objects.length === 0) {
      return null;
    }
    
    const { objects, centerOffset } = this.clipboardData;
    
    // Create new objects with new IDs and adjusted positions
    return objects.map(obj => {
      // Calculate relative position from center
      const relX = obj.position.x - centerOffset.x;
      const relZ = obj.position.z - centerOffset.z;
      
      return {
        ...this.cloneObject(obj),
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // New unique ID
        position: {
          x: targetPosition.x + relX,
          z: targetPosition.z + relZ,
          y: targetPosition.y ?? obj.position.y,
        },
      };
    });
  }
  
  /**
   * Clear clipboard
   */
  clear(): void {
    this.clipboardData = null;
  }
  
  /**
   * Calculate center position of objects and buildings
   */
  private calculateCenter(objects: PlacedObject[], buildings: Building[] = []): GridPosition {
    if (objects.length === 0 && buildings.length === 0) {
      return { x: 0, z: 0, y: 0 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    // Include objects
    for (const obj of objects) {
      const asset = obj.assetMetadata;
      const width = asset?.gridUnits?.x ?? 1;
      const depth = asset?.gridUnits?.z ?? 1;
      
      minX = Math.min(minX, obj.position.x);
      maxX = Math.max(maxX, obj.position.x + width);
      minZ = Math.min(minZ, obj.position.z);
      maxZ = Math.max(maxZ, obj.position.z + depth);
    }
    
    // Include buildings
    for (const building of buildings) {
      for (const fp of building.footprints) {
        minX = Math.min(minX, fp.minX);
        maxX = Math.max(maxX, fp.maxX + 1);
        minZ = Math.min(minZ, fp.minZ);
        maxZ = Math.max(maxZ, fp.maxZ + 1);
      }
    }
    
    return {
      x: Math.floor((minX + maxX) / 2),
      z: Math.floor((minZ + maxZ) / 2),
      y: 0,
    };
  }
  
  /**
   * Clone a building for clipboard
   */
  private cloneBuilding(building: Building): ClipboardBuilding {
    return {
      footprints: building.footprints.map(fp => ({ ...fp })),
      floors: building.floors.map(f => ({ level: f.level, height: f.height })),
      name: building.name,
    };
  }
  
  /**
   * Deep clone a placed object (including skin and all properties)
   */
  private cloneObject(obj: PlacedObject): PlacedObject {
    return {
      id: obj.id,
      assetId: obj.assetId,
      position: { ...obj.position },
      orientation: obj.orientation,
      properties: obj.properties ? { ...obj.properties } : {},
      canStack: obj.canStack,
      assetMetadata: obj.assetMetadata ? { ...obj.assetMetadata } : undefined,
      floor: obj.floor,
      buildingId: obj.buildingId,
      // Preserve skin override
      skinId: obj.skinId,
      // Preserve name (but note: pasted objects will get new names on placement)
      name: obj.name,
      // Don't copy binding - each object should have its own unique binding
    };
  }
  
  /**
   * Get buildings from clipboard
   */
  getBuildings(): ClipboardBuilding[] {
    return this.clipboardData?.buildings ?? [];
  }
  
  /**
   * Get objects from clipboard (without pasting)
   */
  getObjects(): PlacedObject[] {
    return this.clipboardData?.objects ?? [];
  }
}

