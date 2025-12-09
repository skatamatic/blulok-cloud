/**
 * Save Manager
 * 
 * Handles facility save/load operations for the engine.
 */

import {
  FacilityData,
  SerializedPlacedObject,
  SerializedBuilding,
  CameraState,
  GridSize,
} from './types';
import {
  saveFacility as apiSaveFacility,
  updateFacility as apiUpdateFacility,
  getFacility as apiGetFacility,
  getLastOpened as apiGetLastOpened,
} from '@/api/bludesign';

export interface SaveManagerOptions {
  onSaveStart?: () => void;
  onSaveComplete?: (id: string, name: string) => void;
  onSaveError?: (error: Error) => void;
  onLoadStart?: () => void;
  onLoadComplete?: (data: FacilityData) => void;
  onLoadError?: (error: Error) => void;
}

export class SaveManager {
  private currentFacilityId: string | null = null;
  private currentFacilityName: string | null = null;
  private hasUnsavedChanges: boolean = false;
  private options: SaveManagerOptions;

  constructor(options: SaveManagerOptions = {}) {
    this.options = options;
  }

  /**
   * Export current scene state to FacilityData
   */
  exportData(
    name: string,
    camera: CameraState,
    placedObjects: SerializedPlacedObject[],
    buildings: SerializedBuilding[],
    gridSize: GridSize,
    showGrid: boolean,
    activeFloor: number = 0,
    activeSkins: Record<string, string> = {},
    activeThemeId?: string
  ): FacilityData {
    return {
      name,
      version: '2.0.0',
      camera,
      placedObjects,
      buildings,
      activeFloor,
      activeSkins,
      activeThemeId,
      gridSize,
      showGrid,
    };
  }

  /**
   * Save facility (create new or update existing)
   */
  async save(
    name: string,
    data: FacilityData,
    thumbnail?: string
  ): Promise<{ id: string; name: string }> {
    try {
      this.options.onSaveStart?.();

      let id: string;

      if (this.currentFacilityId) {
        // Update existing
        await apiUpdateFacility(this.currentFacilityId, data, thumbnail);
        id = this.currentFacilityId;
      } else {
        // Create new
        const response = await apiSaveFacility(name, data, thumbnail);
        id = response.id;
        this.currentFacilityId = id;
      }

      this.currentFacilityName = name;
      this.hasUnsavedChanges = false;

      this.options.onSaveComplete?.(id, name);

      return { id, name };
    } catch (error) {
      this.options.onSaveError?.(error as Error);
      throw error;
    }
  }

  /**
   * Save as new (always creates new facility)
   */
  async saveAs(
    name: string,
    data: FacilityData,
    thumbnail?: string
  ): Promise<{ id: string; name: string }> {
    try {
      this.options.onSaveStart?.();

      const response = await apiSaveFacility(name, data, thumbnail);
      const id = response.id;

      this.currentFacilityId = id;
      this.currentFacilityName = name;
      this.hasUnsavedChanges = false;

      this.options.onSaveComplete?.(id, name);

      return { id, name };
    } catch (error) {
      this.options.onSaveError?.(error as Error);
      throw error;
    }
  }

  /**
   * Load facility by ID
   */
  async load(id: string): Promise<FacilityData> {
    try {
      this.options.onLoadStart?.();

      const response = await apiGetFacility(id);
      const data = response.data;

      this.currentFacilityId = id;
      this.currentFacilityName = response.name;
      this.hasUnsavedChanges = false;

      this.options.onLoadComplete?.(data);

      return data;
    } catch (error) {
      this.options.onLoadError?.(error as Error);
      throw error;
    }
  }

  /**
   * Load last opened facility
   */
  async loadLast(): Promise<FacilityData | null> {
    try {
      this.options.onLoadStart?.();

      const response = await apiGetLastOpened();
      
      if (!response) {
        return null;
      }

      const data = response.data;

      this.currentFacilityId = response.id;
      this.currentFacilityName = response.name;
      this.hasUnsavedChanges = false;

      this.options.onLoadComplete?.(data);

      return data;
    } catch (error) {
      this.options.onLoadError?.(error as Error);
      throw error;
    }
  }

  /**
   * Mark scene as having unsaved changes
   */
  markDirty(): void {
    this.hasUnsavedChanges = true;
  }

  /**
   * Create new (clear current facility)
   */
  newFacility(): void {
    this.currentFacilityId = null;
    this.currentFacilityName = null;
    this.hasUnsavedChanges = false;
  }

  /**
   * Get current facility info
   */
  getCurrentFacility(): { id: string | null; name: string | null; hasUnsavedChanges: boolean } {
    return {
      id: this.currentFacilityId,
      name: this.currentFacilityName,
      hasUnsavedChanges: this.hasUnsavedChanges,
    };
  }
}



