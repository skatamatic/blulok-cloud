/**
 * Skin Registry
 * 
 * Centralized registry for all asset skins (built-in and custom).
 * Skins are organized by AssetCategory and apply to ALL assets of that category.
 * Supports both localStorage caching and backend API sync.
 * 
 * Example: A "Blue Units" skin for STORAGE_UNIT applies to small, medium, and large units.
 */

import { AssetCategory, PartMaterial } from './types';
import * as bludesignApi from '@/api/bludesign';

/** 
 * A skin defines material overrides for all assets in a category 
 */
export interface CategorySkin {
  id: string;
  name: string;
  description?: string;
  category: AssetCategory;
  partMaterials: Record<string, PartMaterial>;
  isBuiltin: boolean;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Storage key for custom skins */
const CUSTOM_SKINS_KEY = 'bludesign-category-skins-v1';

/**
 * Built-in skins for each category
 */
const BUILTIN_SKINS: CategorySkin[] = [
  // ==================== BUILDING (walls/floors/roof) ====================
  {
    id: 'skin-building-default',
    name: 'Default Building',
    description: 'Neutral building materials',
    category: AssetCategory.BUILDING,
    partMaterials: {
      wall: { color: '#d9d9d9', metalness: 0.05, roughness: 0.9 },
      floor: { color: '#a0a0a0', metalness: 0.05, roughness: 0.85 },
      roof: { color: '#808080', metalness: 0.05, roughness: 0.9 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-building-brick',
    name: 'Brick Facade',
    description: 'Warm brick walls, neutral floor/roof',
    category: AssetCategory.BUILDING,
    partMaterials: {
      wall: { color: '#a85e4d', metalness: 0.0, roughness: 0.92, textureUrl: '/textures/brick.jpg' },
      floor: { color: '#8a8a8a', metalness: 0.05, roughness: 0.85 },
      roof: { color: '#5a4a3a', metalness: 0.05, roughness: 0.85 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-building-glass',
    name: 'Paned Glass',
    description: 'Transparent glass walls with mullion shader, glass roof/floor options',
    category: AssetCategory.BUILDING,
    partMaterials: {
      wall: { color: '#b4d4e8', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35, shader: 'paned-glass' },
      floor: { color: '#c8c8c8', metalness: 0.1, roughness: 0.6, shader: 'glass-floor', transparent: true, opacity: 0.6 },
      roof: { color: '#c4e4f8', metalness: 0.1, roughness: 0.1, shader: 'glass-roof', transparent: true, opacity: 0.5 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-building-metal',
    name: 'Metal Cladding',
    description: 'Sleek metallic walls with darker roof',
    category: AssetCategory.BUILDING,
    partMaterials: {
      wall: { color: '#9aa3ad', metalness: 0.5, roughness: 0.35 },
      floor: { color: '#9a9a9a', metalness: 0.2, roughness: 0.7 },
      roof: { color: '#5c6670', metalness: 0.4, roughness: 0.5 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-building-wireframe',
    name: 'Wireframe',
    description: 'Stylized wireframe building (non-standard shader)',
    category: AssetCategory.BUILDING,
    partMaterials: {
      wall: { color: '#00ffcc', metalness: 0.0, roughness: 1.0, shader: 'wireframe' },
      floor: { color: '#00ffcc', metalness: 0.0, roughness: 1.0, shader: 'wireframe' },
      roof: { color: '#00ffcc', metalness: 0.0, roughness: 1.0, shader: 'wireframe' },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ==================== STORAGE UNITS ====================
  {
    id: 'skin-unit-default',
    name: 'Default',
    description: 'Clean white storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#f7f7f7', metalness: 0.3, roughness: 0.7 },
      door: { color: '#5a6068', metalness: 0.5, roughness: 0.4 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-unit-blue',
    name: 'Blue Steel',
    description: 'Professional blue storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#3b82f6', metalness: 0.4, roughness: 0.5 },
      door: { color: '#1e3a5f', metalness: 0.6, roughness: 0.3 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-unit-orange',
    name: 'Orange',
    description: 'Bright orange storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#f97316', metalness: 0.3, roughness: 0.6 },
      door: { color: '#c2410c', metalness: 0.5, roughness: 0.4 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-unit-green',
    name: 'Forest Green',
    description: 'Classic green storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#22c55e', metalness: 0.3, roughness: 0.6 },
      door: { color: '#166534', metalness: 0.5, roughness: 0.4 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-unit-red',
    name: 'Classic Red',
    description: 'Bold red storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#ef4444', metalness: 0.3, roughness: 0.6 },
      door: { color: '#991b1b', metalness: 0.5, roughness: 0.4 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-unit-charcoal',
    name: 'Charcoal',
    description: 'Dark premium storage units',
    category: AssetCategory.STORAGE_UNIT,
    partMaterials: {
      body: { color: '#374151', metalness: 0.4, roughness: 0.5 },
      door: { color: '#111827', metalness: 0.6, roughness: 0.3 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== GATES ====================
  {
    id: 'skin-gate-default',
    name: 'Default',
    description: 'Standard gray gate',
    category: AssetCategory.GATE,
    partMaterials: {
      frame: { color: '#4a5568', metalness: 0.6, roughness: 0.4 },
      bars: { color: '#718096', metalness: 0.7, roughness: 0.3 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-gate-chrome',
    name: 'Chrome',
    description: 'Shiny chrome gate',
    category: AssetCategory.GATE,
    partMaterials: {
      frame: { color: '#e5e7eb', metalness: 0.9, roughness: 0.1 },
      bars: { color: '#f3f4f6', metalness: 0.95, roughness: 0.05 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-gate-black',
    name: 'Matte Black',
    description: 'Elegant matte black gate',
    category: AssetCategory.GATE,
    partMaterials: {
      frame: { color: '#1f2937', metalness: 0.3, roughness: 0.7 },
      bars: { color: '#111827', metalness: 0.4, roughness: 0.6 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== DOORS ====================
  {
    id: 'skin-door-default',
    name: 'Default',
    description: 'Standard gray door',
    category: AssetCategory.DOOR,
    partMaterials: {
      frame: { color: '#4a5568', metalness: 0.5, roughness: 0.5 },
      panel: { color: '#6b7280', metalness: 0.4, roughness: 0.6 },
      handle: { color: '#9ca3af', metalness: 0.8, roughness: 0.2 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-door-white',
    name: 'White',
    description: 'Clean white door',
    category: AssetCategory.DOOR,
    partMaterials: {
      frame: { color: '#e5e7eb', metalness: 0.3, roughness: 0.7 },
      panel: { color: '#ffffff', metalness: 0.2, roughness: 0.8 },
      handle: { color: '#9ca3af', metalness: 0.8, roughness: 0.2 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== FENCES ====================
  {
    id: 'skin-fence-default',
    name: 'Default',
    description: 'Standard chain-link fence',
    category: AssetCategory.FENCE,
    partMaterials: {
      frame: { color: '#4a5568', metalness: 0.65, roughness: 0.35 },
      mesh: { color: '#6b7280', metalness: 0.7, roughness: 0.3 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-fence-black',
    name: 'Black Iron',
    description: 'Black wrought iron fence',
    category: AssetCategory.FENCE,
    partMaterials: {
      frame: { color: '#1f2937', metalness: 0.5, roughness: 0.5 },
      mesh: { color: '#111827', metalness: 0.6, roughness: 0.4 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== ELEVATORS ====================
  {
    id: 'skin-elevator-default',
    name: 'Default',
    description: 'Standard elevator',
    category: AssetCategory.ELEVATOR,
    partMaterials: {
      frame: { color: '#c0c8d0', metalness: 0.4, roughness: 0.25 },
      doors: { color: '#d0d8e0', metalness: 0.5, roughness: 0.1 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-elevator-chrome',
    name: 'Chrome',
    description: 'Polished chrome elevator',
    category: AssetCategory.ELEVATOR,
    partMaterials: {
      frame: { color: '#e5e7eb', metalness: 0.8, roughness: 0.1 },
      doors: { color: '#f3f4f6', metalness: 0.9, roughness: 0.05 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-elevator-gold',
    name: 'Gold Accent',
    description: 'Premium elevator with gold accents',
    category: AssetCategory.ELEVATOR,
    partMaterials: {
      frame: { color: '#d4af37', metalness: 0.7, roughness: 0.2 },
      doors: { color: '#e5e7eb', metalness: 0.6, roughness: 0.15 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== STAIRWELLS ====================
  {
    id: 'skin-stairwell-default',
    name: 'Default',
    description: 'Standard fire-escape stairwell',
    category: AssetCategory.STAIRWELL,
    partMaterials: {
      walls: { color: '#e5e5e0', metalness: 0.05, roughness: 0.85 },
      steps: { color: '#9ca3af', metalness: 0.1, roughness: 0.75 },
      railings: { color: '#c0c8d0', metalness: 0.4, roughness: 0.25 },
      door: { color: '#4a5568', metalness: 0.3, roughness: 0.6 },
      sign: { color: '#22c55e', metalness: 0.1, roughness: 0.8 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-stairwell-industrial',
    name: 'Industrial',
    description: 'Exposed concrete industrial stairwell',
    category: AssetCategory.STAIRWELL,
    partMaterials: {
      walls: { color: '#6b7280', metalness: 0.1, roughness: 0.9 },
      steps: { color: '#4b5563', metalness: 0.2, roughness: 0.8 },
      railings: { color: '#fbbf24', metalness: 0.5, roughness: 0.4 },
      door: { color: '#1f2937', metalness: 0.4, roughness: 0.5 },
      sign: { color: '#22c55e', metalness: 0.1, roughness: 0.8 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'skin-stairwell-modern',
    name: 'Modern',
    description: 'Clean modern stairwell with glass accents',
    category: AssetCategory.STAIRWELL,
    partMaterials: {
      walls: { color: '#ffffff', metalness: 0.02, roughness: 0.95 },
      steps: { color: '#e5e7eb', metalness: 0.15, roughness: 0.6 },
      railings: { color: '#e5e7eb', metalness: 0.7, roughness: 0.1 },
      door: { color: '#374151', metalness: 0.3, roughness: 0.5 },
      sign: { color: '#22c55e', metalness: 0.1, roughness: 0.8 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  // ==================== KIOSKS ====================
  {
    id: 'skin-kiosk-default',
    name: 'Default',
    description: 'Standard kiosk',
    category: AssetCategory.KIOSK,
    partMaterials: {
      cabinet: { color: '#e5e7eb', metalness: 0.2, roughness: 0.7 },
      counter: { color: '#9ca3af', metalness: 0.4, roughness: 0.5 },
      awning: { color: '#147fd4', metalness: 0.1, roughness: 0.8 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

/**
 * Singleton SkinRegistry for managing all category skins
 */
class SkinRegistryClass {
  private skins: Map<string, CategorySkin> = new Map();
  private skinsByCategory: Map<AssetCategory, CategorySkin[]> = new Map();
  
  constructor() {
    this.loadBuiltinSkins();
    this.loadCustomSkins();
  }
  
  private loadBuiltinSkins(): void {
    BUILTIN_SKINS.forEach(skin => {
      this.registerSkin(skin);
    });
  }
  
  private loadCustomSkins(): void {
    try {
      const stored = localStorage.getItem(CUSTOM_SKINS_KEY);
      if (stored) {
        const customSkins: CategorySkin[] = JSON.parse(stored);
        customSkins.forEach(skin => {
          skin.isBuiltin = false;
          skin.createdAt = new Date(skin.createdAt);
          skin.updatedAt = new Date(skin.updatedAt);
          this.registerSkin(skin);
        });
      }
    } catch (error) {
      console.error('Failed to load custom skins:', error);
    }
  }
  
  private saveCustomSkins(): void {
    try {
      const customSkins = Array.from(this.skins.values()).filter(s => !s.isBuiltin);
      localStorage.setItem(CUSTOM_SKINS_KEY, JSON.stringify(customSkins));
    } catch (error) {
      console.error('Failed to save custom skins:', error);
    }
  }
  
  private registerSkin(skin: CategorySkin): void {
    this.skins.set(skin.id, skin);
    
    if (!this.skinsByCategory.has(skin.category)) {
      this.skinsByCategory.set(skin.category, []);
    }
    this.skinsByCategory.get(skin.category)!.push(skin);
  }
  
  /**
   * Get a skin by ID
   */
  getSkin(skinId: string): CategorySkin | null {
    return this.skins.get(skinId) || null;
  }
  
  /**
   * Get all skins for a category
   */
  getSkinsForCategory(category: AssetCategory): CategorySkin[] {
    return this.skinsByCategory.get(category) || [];
  }
  
  /**
   * Get the default skin for a category
   */
  getDefaultSkin(category: AssetCategory): CategorySkin | null {
    const skins = this.getSkinsForCategory(category);
    return skins.find(s => s.name === 'Default') || skins[0] || null;
  }
  
  /**
   * Get all skins
   */
  getAllSkins(): CategorySkin[] {
    return Array.from(this.skins.values());
  }
  
  /**
   * Get all categories that have skins defined
   */
  getCategoriesWithSkins(): AssetCategory[] {
    return Array.from(this.skinsByCategory.keys());
  }
  
  /**
   * Create a new custom skin
   */
  createSkin(skin: Omit<CategorySkin, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): CategorySkin {
    const newSkin: CategorySkin = {
      ...skin,
      id: `skin-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.registerSkin(newSkin);
    this.saveCustomSkins();
    
    return newSkin;
  }
  
  /**
   * Update a skin. For built-in skins, creates a copy instead of modifying.
   * Returns the updated skin (or new copy for built-ins).
   */
  updateSkin(skinId: string, updates: Partial<Omit<CategorySkin, 'id' | 'isBuiltin' | 'createdAt'>>): CategorySkin | null {
    const skin = this.skins.get(skinId);
    if (!skin) {
      console.warn('Skin not found:', skinId);
      return null;
    }
    
    // For built-in skins, create a copy with the updates applied
    if (skin.isBuiltin) {
      const copiedSkin: CategorySkin = {
        ...skin,
        ...updates,
        id: `skin-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: updates.name || `${skin.name} (Custom)`,
        isBuiltin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      this.skins.set(copiedSkin.id, copiedSkin);
      
      // Add to category list
      const categoryList = this.skinsByCategory.get(copiedSkin.category);
      if (categoryList) {
        categoryList.push(copiedSkin);
      } else {
        this.skinsByCategory.set(copiedSkin.category, [copiedSkin]);
      }
      
      this.saveCustomSkins();
      return copiedSkin;
    }
    
    // For custom skins, update in place
    const updated: CategorySkin = {
      ...skin,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.skins.set(skinId, updated);
    
    // Update in category list
    const categoryList = this.skinsByCategory.get(skin.category);
    if (categoryList) {
      const index = categoryList.findIndex(s => s.id === skinId);
      if (index >= 0) {
        categoryList[index] = updated;
      }
    }
    
    this.saveCustomSkins();
    return updated;
  }
  
  /**
   * Delete a custom skin
   */
  deleteSkin(skinId: string): boolean {
    const skin = this.skins.get(skinId);
    if (!skin || skin.isBuiltin) {
      console.warn('Cannot delete builtin skin or skin not found:', skinId);
      return false;
    }
    
    this.skins.delete(skinId);
    
    // Remove from category list
    const categoryList = this.skinsByCategory.get(skin.category);
    if (categoryList) {
      const index = categoryList.findIndex(s => s.id === skinId);
      if (index >= 0) {
        categoryList.splice(index, 1);
      }
    }
    
    this.saveCustomSkins();
    return true;
  }
  
  /**
   * Duplicate a skin (creates a custom copy)
   */
  duplicateSkin(skinId: string, newName?: string): CategorySkin | null {
    const original = this.skins.get(skinId);
    if (!original) return null;
    
    return this.createSkin({
      name: newName || `${original.name} Copy`,
      description: original.description,
      category: original.category,
      partMaterials: { ...original.partMaterials },
    });
  }
  
  /**
   * Get human-readable category label
   */
  static getCategoryLabel(category: AssetCategory): string {
    const labels: Partial<Record<AssetCategory, string>> = {
      [AssetCategory.STORAGE_UNIT]: 'Storage Units',
      [AssetCategory.GATE]: 'Gates',
      [AssetCategory.DOOR]: 'Doors',
      [AssetCategory.FENCE]: 'Fences',
      [AssetCategory.ELEVATOR]: 'Elevators',
      [AssetCategory.STAIRWELL]: 'Stairwells',
      [AssetCategory.KIOSK]: 'Kiosks',
      [AssetCategory.ACCESS_CONTROL]: 'Access Control',
      [AssetCategory.WINDOW]: 'Windows',
      [AssetCategory.DECORATION]: 'Decorations',
    };
    return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  // ==========================================================================
  // Backend API Sync Methods
  // ==========================================================================
  
  private backendSyncEnabled = false;
  
  /**
   * Enable backend sync - fetches skins from backend and syncs future changes
   */
  async enableBackendSync(): Promise<void> {
    this.backendSyncEnabled = true;
    await this.syncFromBackend();
  }
  
  /**
   * Disable backend sync - uses localStorage only
   */
  disableBackendSync(): void {
    this.backendSyncEnabled = false;
  }
  
  /**
   * Sync custom skins from backend to local state
   */
  async syncFromBackend(): Promise<void> {
    if (!this.backendSyncEnabled) return;
    
    try {
      const backendSkins = await bludesignApi.getSkins();
      
      // Merge backend skins with local state
      for (const apiSkin of backendSkins) {
        const skin: CategorySkin = {
          id: apiSkin.id,
          name: apiSkin.name,
          description: apiSkin.description,
          category: apiSkin.category as AssetCategory,
          partMaterials: apiSkin.partMaterials as unknown as Record<string, PartMaterial>,
          thumbnail: apiSkin.thumbnail,
          isBuiltin: false,
          createdAt: apiSkin.createdAt,
          updatedAt: apiSkin.updatedAt,
        };
        
        this.registerSkin(skin);
      }
      
      // Save to localStorage as cache
      this.saveCustomSkins();
    } catch (error) {
      console.warn('Failed to sync skins from backend:', error);
    }
  }
  
  /**
   * Create a new skin and optionally sync to backend
   */
  async createSkinAsync(skinData: Omit<CategorySkin, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): Promise<CategorySkin> {
    const skin = this.createSkin(skinData);
    
    if (this.backendSyncEnabled) {
      try {
        const apiSkin = await bludesignApi.createSkinApi({
          name: skin.name,
          description: skin.description,
          category: skin.category,
          partMaterials: skin.partMaterials as unknown as Record<string, Record<string, unknown>>,
          thumbnail: skin.thumbnail,
        });
        
        // Update local skin with backend ID
        this.skins.delete(skin.id);
        const categoryList = this.skinsByCategory.get(skin.category);
        if (categoryList) {
          const index = categoryList.findIndex(s => s.id === skin.id);
          if (index >= 0) {
            categoryList.splice(index, 1);
          }
        }
        
        skin.id = apiSkin.id;
        this.registerSkin(skin);
        this.saveCustomSkins();
      } catch (error) {
        console.warn('Failed to sync new skin to backend:', error);
      }
    }
    
    return skin;
  }
  
  /**
   * Update a skin and optionally sync to backend
   */
  async updateSkinAsync(skinId: string, updates: Partial<Omit<CategorySkin, 'id' | 'isBuiltin' | 'createdAt'>>): Promise<CategorySkin | null> {
    const result = this.updateSkin(skinId, updates);
    
    if (result && this.backendSyncEnabled && !result.isBuiltin) {
      try {
        await bludesignApi.updateSkinApi(result.id, {
          name: result.name,
          description: result.description,
          partMaterials: result.partMaterials as unknown as Record<string, Record<string, unknown>>,
          thumbnail: result.thumbnail,
        });
      } catch (error) {
        console.warn('Failed to sync skin update to backend:', error);
      }
    }
    
    return result;
  }
  
  /**
   * Delete a skin and optionally sync to backend
   */
  async deleteSkinAsync(skinId: string): Promise<boolean> {
    const skin = this.skins.get(skinId);
    const wasBackendSkin = skin && !skin.isBuiltin && skinId.startsWith('skin-custom-');
    
    const result = this.deleteSkin(skinId);
    
    if (result && this.backendSyncEnabled && wasBackendSkin) {
      try {
        await bludesignApi.deleteSkinApi(skinId);
      } catch (error) {
        console.warn('Failed to sync skin deletion to backend:', error);
      }
    }
    
    return result;
  }
}

// Singleton instance
let skinRegistryInstance: SkinRegistryClass | null = null;

export function getSkinRegistry(): SkinRegistryClass {
  if (!skinRegistryInstance) {
    skinRegistryInstance = new SkinRegistryClass();
  }
  return skinRegistryInstance;
}

// Export for type usage
export { SkinRegistryClass };

