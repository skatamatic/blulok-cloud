/**
 * Skin Manager
 * 
 * Manages asset skins (material overrides) by CATEGORY, not specific asset.
 * This allows a "Blue Units" skin to apply to all storage units regardless of size.
 * Supports global (shared) and facility-specific skins.
 */

import * as THREE from 'three';
import { AssetSkin, PartMaterial, AssetCategory } from './types';
import { AssetFactory } from '../assets/AssetFactory';

export class SkinManager {
  // Skins organized by category (e.g., "storage_unit", "gate", "door")
  private globalSkins: Map<AssetCategory, AssetSkin[]> = new Map();
  private facilitySkins: Map<AssetCategory, AssetSkin[]> = new Map();
  
  // Active skin per category
  private activeSkins: Map<AssetCategory, string> = new Map(); // category -> activeSkinId
  
  private facilityId: string | null = null;

  constructor(facilityId?: string) {
    this.facilityId = facilityId || null;
    this.loadGlobalSkins();
  }

  /**
   * Load global skins from localStorage
   */
  private loadGlobalSkins(): void {
    try {
      const stored = localStorage.getItem('bludesign-global-skins-v2');
      if (stored) {
        const skins: AssetSkin[] = JSON.parse(stored);
        skins.forEach(skin => {
          const category = skin.category as AssetCategory;
          if (!this.globalSkins.has(category)) {
            this.globalSkins.set(category, []);
          }
          this.globalSkins.get(category)!.push(skin);
        });
      }
    } catch (error) {
      console.error('Failed to load global skins:', error);
    }
  }

  /**
   * Save global skins to localStorage
   */
  private saveGlobalSkins(): void {
    try {
      const allSkins: AssetSkin[] = [];
      this.globalSkins.forEach(skins => {
        allSkins.push(...skins.filter(s => s.isGlobal));
      });
      localStorage.setItem('bludesign-global-skins-v2', JSON.stringify(allSkins));
    } catch (error) {
      console.error('Failed to save global skins:', error);
    }
  }

  /**
   * Set the current facility ID
   */
  setFacilityId(facilityId: string | null): void {
    this.facilityId = facilityId;
  }

  /**
   * Load facility-specific skins
   */
  loadFacilitySkins(skins: AssetSkin[]): void {
    this.facilitySkins.clear();
    skins.forEach(skin => {
      const category = skin.category as AssetCategory;
      if (!this.facilitySkins.has(category)) {
        this.facilitySkins.set(category, []);
      }
      this.facilitySkins.get(category)!.push(skin);
    });
  }

  /**
   * Get all facility-specific skins for export
   */
  getFacilitySkins(): AssetSkin[] {
    const allSkins: AssetSkin[] = [];
    this.facilitySkins.forEach(skins => {
      allSkins.push(...skins);
    });
    return allSkins;
  }

  /**
   * Get all available skins for a category (global + facility-specific)
   */
  getSkinsForCategory(category: AssetCategory): AssetSkin[] {
    const global = this.globalSkins.get(category) || [];
    const facility = this.facilitySkins.get(category) || [];
    return [...global, ...facility];
  }

  /**
   * Get skins for an asset by looking up its category
   * This is the main method to use - pass the asset's category
   */
  getSkins(category: AssetCategory): AssetSkin[] {
    return this.getSkinsForCategory(category);
  }

  /**
   * Get a specific skin by category and skin ID
   */
  getSkin(category: AssetCategory, skinId: string): AssetSkin | null {
    const allSkins = this.getSkinsForCategory(category);
    return allSkins.find(s => s.id === skinId) || null;
  }

  /**
   * Get a skin by ID only (searches all categories)
   */
  getSkinById(skinId: string): AssetSkin | null {
    // Search global skins
    for (const skins of this.globalSkins.values()) {
      const found = skins.find(s => s.id === skinId);
      if (found) return found;
    }
    // Search facility skins
    for (const skins of this.facilitySkins.values()) {
      const found = skins.find(s => s.id === skinId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get all skins (global + facility) formatted for UI
   */
  getAllSkins(): { id: string; name: string; category: AssetCategory }[] {
    const result: { id: string; name: string; category: AssetCategory }[] = [];
    
    // Add global skins
    this.globalSkins.forEach((skins, category) => {
      skins.forEach(skin => {
        result.push({ id: skin.id, name: skin.name, category });
      });
    });
    
    // Add facility skins
    this.facilitySkins.forEach((skins, category) => {
      skins.forEach(skin => {
        result.push({ id: skin.id, name: skin.name, category });
      });
    });
    
    return result;
  }

  /**
   * Get the currently active skin for a category
   */
  getActiveSkin(category: AssetCategory): AssetSkin | null {
    const activeSkinId = this.activeSkins.get(category);
    if (!activeSkinId) return null;

    const allSkins = this.getSkinsForCategory(category);
    return allSkins.find(s => s.id === activeSkinId) || null;
  }

  /**
   * Set the active skin for a category
   */
  setActiveSkin(category: AssetCategory, skinId: string | null): void {
    if (skinId) {
      this.activeSkins.set(category, skinId);
    } else {
      this.activeSkins.delete(category);
    }
  }

  /**
   * Create a new skin for a category
   */
  createSkin(skin: Omit<AssetSkin, 'id' | 'createdAt' | 'updatedAt'>): AssetSkin {
    const newSkin: AssetSkin = {
      ...skin,
      id: `skin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const category = newSkin.category;

    if (newSkin.isGlobal) {
      if (!this.globalSkins.has(category)) {
        this.globalSkins.set(category, []);
      }
      this.globalSkins.get(category)!.push(newSkin);
      this.saveGlobalSkins();
    } else {
      if (!this.facilitySkins.has(category)) {
        this.facilitySkins.set(category, []);
      }
      this.facilitySkins.get(category)!.push(newSkin);
    }

    return newSkin;
  }

  /**
   * Update an existing skin
   */
  updateSkin(skinId: string, updates: Partial<Omit<AssetSkin, 'id' | 'createdAt'>>): AssetSkin | null {
    // Find the skin in global or facility skins
    let foundSkin: AssetSkin | null = null;
    let isGlobal = false;

    for (const [category, skins] of this.globalSkins) {
      const index = skins.findIndex(s => s.id === skinId);
      if (index !== -1) {
        foundSkin = skins[index];
        isGlobal = true;
        skins[index] = {
          ...foundSkin,
          ...updates,
          updatedAt: new Date(),
        };
        foundSkin = skins[index];
        break;
      }
    }

    if (!foundSkin) {
      for (const [category, skins] of this.facilitySkins) {
        const index = skins.findIndex(s => s.id === skinId);
        if (index !== -1) {
          foundSkin = skins[index];
          skins[index] = {
            ...foundSkin,
            ...updates,
            updatedAt: new Date(),
          };
          foundSkin = skins[index];
          break;
        }
      }
    }

    if (foundSkin && isGlobal) {
      this.saveGlobalSkins();
    }

    return foundSkin;
  }

  /**
   * Delete a skin
   */
  deleteSkin(skinId: string): boolean {
    // Try to find and delete from global skins
    for (const [category, skins] of this.globalSkins) {
      const index = skins.findIndex(s => s.id === skinId);
      if (index !== -1) {
        skins.splice(index, 1);
        this.saveGlobalSkins();
        
        // Clear active skin if it was deleted
        if (this.activeSkins.get(category) === skinId) {
          this.activeSkins.delete(category);
        }
        
        return true;
      }
    }

    // Try to find and delete from facility skins
    for (const [category, skins] of this.facilitySkins) {
      const index = skins.findIndex(s => s.id === skinId);
      if (index !== -1) {
        skins.splice(index, 1);
        
        // Clear active skin if it was deleted
        if (this.activeSkins.get(category) === skinId) {
          this.activeSkins.delete(category);
        }
        
        return true;
      }
    }

    return false;
  }

  /**
   * Apply a skin to a mesh
   */
  applySkin(mesh: THREE.Object3D, skin: AssetSkin): void {
    AssetFactory.applyMaterials(mesh, skin.partMaterials);
  }

  /**
   * Apply the active skin to a mesh based on asset category
   */
  applyActiveSkin(mesh: THREE.Object3D, category: AssetCategory): boolean {
    const activeSkin = this.getActiveSkin(category);
    if (activeSkin) {
      this.applySkin(mesh, activeSkin);
      return true;
    }
    return false;
  }

  /**
   * Extract materials from a mesh to create a skin for a category
   */
  extractSkinFromMesh(mesh: THREE.Object3D, category: AssetCategory, name: string): AssetSkin | null {
    const partMaterials: Record<string, PartMaterial> = {};
    
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.partName) {
        const partName = child.userData.partName as string;
        const material = child.material as THREE.MeshStandardMaterial;
        
        if (material) {
          partMaterials[partName] = {
            color: '#' + material.color.getHexString(),
            metalness: material.metalness,
            roughness: material.roughness,
            emissive: material.emissive ? '#' + material.emissive.getHexString() : undefined,
            emissiveIntensity: material.emissiveIntensity,
            transparent: material.transparent,
            opacity: material.opacity,
          };
        }
      }
    });

    if (Object.keys(partMaterials).length === 0) {
      return null;
    }

    return {
      id: `skin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      isGlobal: false,
      facilityId: this.facilityId || undefined,
      partMaterials,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get categories that have skins defined
   */
  getCategoriesWithSkins(): AssetCategory[] {
    const categories = new Set<AssetCategory>();
    
    for (const category of this.globalSkins.keys()) {
      categories.add(category);
    }
    for (const category of this.facilitySkins.keys()) {
      categories.add(category);
    }
    
    return Array.from(categories);
  }

  /**
   * Get human-readable label for a category
   */
  static getCategoryLabel(category: AssetCategory): string {
    const labels: Record<AssetCategory, string> = {
      [AssetCategory.STORAGE_UNIT]: 'Storage Units',
      [AssetCategory.GATE]: 'Gates',
      [AssetCategory.ELEVATOR]: 'Elevators',
      [AssetCategory.ACCESS_CONTROL]: 'Access Control',
      [AssetCategory.BUILDING]: 'Buildings',
      [AssetCategory.WALL]: 'Walls',
      [AssetCategory.INTERIOR_WALL]: 'Interior Walls',
      [AssetCategory.FLOOR]: 'Floors',
      [AssetCategory.CEILING]: 'Ceilings',
      [AssetCategory.STAIRWELL]: 'Stairwells',
      [AssetCategory.DOOR]: 'Doors',
      [AssetCategory.WINDOW]: 'Windows',
      [AssetCategory.PAVEMENT]: 'Pavement',
      [AssetCategory.GRASS]: 'Grass',
      [AssetCategory.GRAVEL]: 'Gravel',
      [AssetCategory.FENCE]: 'Fences',
      [AssetCategory.LANDSCAPING]: 'Landscaping',
      [AssetCategory.SIGNAGE]: 'Signage',
      [AssetCategory.DECORATION]: 'Decorations',
      [AssetCategory.KIOSK]: 'Kiosks',
      [AssetCategory.BOLLARD]: 'Bollards',
      [AssetCategory.CAMERA]: 'Cameras',
      [AssetCategory.LIGHTING]: 'Lighting',
      [AssetCategory.UTILITY]: 'Utilities',
    };
    return labels[category] || category;
  }

  /**
   * Clear all skins
   */
  clear(): void {
    this.facilitySkins.clear();
    this.activeSkins.clear();
  }
}

