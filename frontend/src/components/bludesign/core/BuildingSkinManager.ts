/**
 * Building Skin Manager
 * 
 * Manages building material skins (brick, glass, concrete, etc.)
 * with support for custom textures and extensible skin definitions.
 */

import * as THREE from 'three';
import { BuildingSkinType } from './types';

/** Skin definition with materials for walls, floors, and roof */
export interface BuildingSkinDefinition {
  id: BuildingSkinType | string;
  name: string;
  description: string;
  preview?: string; // URL to preview image
  wallMaterial: THREE.MeshStandardMaterialParameters;
  floorMaterial?: THREE.MeshStandardMaterialParameters;
  roofMaterial?: THREE.MeshStandardMaterialParameters;
  // For glass buildings, we need special handling
  isTransparent?: boolean;
  transmissionFactor?: number;
}

/** Built-in skin definitions */
const BUILTIN_SKINS: BuildingSkinDefinition[] = [
  {
    id: BuildingSkinType.DEFAULT,
    name: 'Default',
    description: 'Standard building material with clean appearance',
    wallMaterial: {
      color: 0xe8e4dc,
      roughness: 0.7,
      metalness: 0.0,
    },
    floorMaterial: {
      color: 0xb8b4ac,
      roughness: 0.6,
      metalness: 0.0,
    },
    roofMaterial: {
      color: 0x5a5552,
      roughness: 0.8,
      metalness: 0.1,
    },
  },
  {
    id: BuildingSkinType.BRICK,
    name: 'Brick',
    description: 'Classic red brick exterior',
    wallMaterial: {
      color: 0xa85032, // Red brick color
      roughness: 0.85,
      metalness: 0.0,
    },
    floorMaterial: {
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.0,
    },
    roofMaterial: {
      color: 0x4a3c32,
      roughness: 0.8,
      metalness: 0.05,
    },
  },
  {
    id: BuildingSkinType.GLASS,
    name: 'Glass',
    description: 'Modern floor-to-ceiling glass facade',
    isTransparent: true,
    transmissionFactor: 0.7,
    wallMaterial: {
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      opacity: 0.35,
    },
    floorMaterial: {
      color: 0x202020,
      roughness: 0.3,
      metalness: 0.2,
    },
    roofMaterial: {
      color: 0x303030,
      roughness: 0.4,
      metalness: 0.3,
    },
  },
  {
    id: BuildingSkinType.CONCRETE,
    name: 'Concrete',
    description: 'Industrial concrete finish',
    wallMaterial: {
      color: 0x909090,
      roughness: 0.9,
      metalness: 0.0,
    },
    floorMaterial: {
      color: 0x707070,
      roughness: 0.85,
      metalness: 0.0,
    },
    roofMaterial: {
      color: 0x505050,
      roughness: 0.8,
      metalness: 0.05,
    },
  },
  {
    id: BuildingSkinType.METAL,
    name: 'Metal',
    description: 'Industrial metal cladding',
    wallMaterial: {
      color: 0x7a8a9a,
      roughness: 0.4,
      metalness: 0.7,
    },
    floorMaterial: {
      color: 0x505560,
      roughness: 0.5,
      metalness: 0.3,
    },
    roofMaterial: {
      color: 0x404550,
      roughness: 0.35,
      metalness: 0.8,
    },
  },
];

export class BuildingSkinManager {
  private skins: Map<string, BuildingSkinDefinition> = new Map();
  private textureLoader: THREE.TextureLoader;
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  
  // Custom skins from localStorage or facility
  private customSkins: BuildingSkinDefinition[] = [];
  
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    
    // Register built-in skins
    BUILTIN_SKINS.forEach(skin => {
      this.skins.set(skin.id, skin);
    });
    
    // Load custom skins from localStorage
    this.loadCustomSkins();
  }
  
  /**
   * Load custom skins from localStorage
   */
  private loadCustomSkins(): void {
    try {
      const stored = localStorage.getItem('bludesign-building-skins');
      if (stored) {
        this.customSkins = JSON.parse(stored);
        this.customSkins.forEach(skin => {
          this.skins.set(skin.id, skin);
        });
      }
    } catch (error) {
      console.error('Failed to load custom building skins:', error);
    }
  }
  
  /**
   * Save custom skins to localStorage
   */
  private saveCustomSkins(): void {
    try {
      localStorage.setItem('bludesign-building-skins', JSON.stringify(this.customSkins));
    } catch (error) {
      console.error('Failed to save custom building skins:', error);
    }
  }
  
  /**
   * Get all available skins
   */
  getAllSkins(): BuildingSkinDefinition[] {
    return Array.from(this.skins.values());
  }
  
  /**
   * Get built-in skins only
   */
  getBuiltinSkins(): BuildingSkinDefinition[] {
    return BUILTIN_SKINS;
  }
  
  /**
   * Get custom skins only
   */
  getCustomSkins(): BuildingSkinDefinition[] {
    return this.customSkins;
  }
  
  /**
   * Get a skin by ID
   */
  getSkin(skinId: string): BuildingSkinDefinition | undefined {
    return this.skins.get(skinId);
  }
  
  /**
   * Create a wall material for a skin
   * Stores baseOpacity in userData for proper ghosting calculations
   */
  createWallMaterial(skinId: string): THREE.Material {
    const skin = this.skins.get(skinId) || this.skins.get(BuildingSkinType.DEFAULT)!;
    
    if (skin.isTransparent) {
      // Use MeshPhysicalMaterial for glass-like transparency
      const mat = new THREE.MeshPhysicalMaterial({
        ...skin.wallMaterial,
        transmission: skin.transmissionFactor || 0.7,
        thickness: 0.1,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      // Store base opacity for ghosting calculations (effective opacity = baseOpacity * ghostOpacity)
      const baseOpacity = skin.wallMaterial.opacity ?? 1.0;
      mat.userData.baseOpacity = baseOpacity;
      mat.userData.isNaturallyTransparent = true;
      return mat;
    }
    
    const mat = new THREE.MeshStandardMaterial(skin.wallMaterial);
    mat.userData.baseOpacity = 1.0;
    return mat;
  }
  
  /**
   * Create a floor material for a skin
   */
  createFloorMaterial(skinId: string): THREE.MeshStandardMaterial {
    const skin = this.skins.get(skinId) || this.skins.get(BuildingSkinType.DEFAULT)!;
    return new THREE.MeshStandardMaterial(skin.floorMaterial || skin.wallMaterial);
  }
  
  /**
   * Create a roof material for a skin
   */
  createRoofMaterial(skinId: string): THREE.MeshStandardMaterial {
    const skin = this.skins.get(skinId) || this.skins.get(BuildingSkinType.DEFAULT)!;
    return new THREE.MeshStandardMaterial(skin.roofMaterial || skin.wallMaterial);
  }
  
  /**
   * Add a custom skin
   */
  addCustomSkin(skin: Omit<BuildingSkinDefinition, 'id'> & { id?: string }): BuildingSkinDefinition {
    const newSkin: BuildingSkinDefinition = {
      ...skin,
      id: skin.id || `custom-skin-${Date.now()}`,
    };
    
    this.customSkins.push(newSkin);
    this.skins.set(newSkin.id, newSkin);
    this.saveCustomSkins();
    
    return newSkin;
  }
  
  /**
   * Update a custom skin
   */
  updateCustomSkin(skinId: string, updates: Partial<BuildingSkinDefinition>): boolean {
    const index = this.customSkins.findIndex(s => s.id === skinId);
    if (index === -1) return false;
    
    this.customSkins[index] = { ...this.customSkins[index], ...updates };
    this.skins.set(skinId, this.customSkins[index]);
    this.saveCustomSkins();
    
    return true;
  }
  
  /**
   * Delete a custom skin
   */
  deleteCustomSkin(skinId: string): boolean {
    const index = this.customSkins.findIndex(s => s.id === skinId);
    if (index === -1) return false;
    
    this.customSkins.splice(index, 1);
    this.skins.delete(skinId);
    this.saveCustomSkins();
    
    return true;
  }
  
  /**
   * Check if a skin ID is a built-in skin
   */
  isBuiltinSkin(skinId: string): boolean {
    return BUILTIN_SKINS.some(s => s.id === skinId);
  }
  
  /**
   * Load facility-specific skins
   */
  loadFacilitySkins(skins: BuildingSkinDefinition[]): void {
    skins.forEach(skin => {
      if (!this.isBuiltinSkin(skin.id)) {
        this.skins.set(skin.id, skin);
      }
    });
  }
  
  /**
   * Export custom skins for facility saving
   */
  exportCustomSkins(): BuildingSkinDefinition[] {
    return [...this.customSkins];
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();
  }
}

// Singleton instance
let skinManagerInstance: BuildingSkinManager | null = null;

export function getBuildingSkinManager(): BuildingSkinManager {
  if (!skinManagerInstance) {
    skinManagerInstance = new BuildingSkinManager();
  }
  return skinManagerInstance;
}

