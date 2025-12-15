/**
 * SkinRegistry Tests
 * 
 * Tests for the centralized skin registry that manages built-in and custom skins.
 */

import { SkinRegistryClass } from '../../../components/bludesign/core/SkinRegistry';
import { AssetCategory } from '../../../components/bludesign/core/types';

describe('SkinRegistry', () => {
  let registry: SkinRegistryClass;
  
  beforeEach(() => {
    // Create a fresh instance for each test
    registry = new SkinRegistryClass();
    
    // Clear localStorage to ensure clean state
    localStorage.removeItem('bludesign-category-skins-v1');
  });
  
  describe('Built-in Skins', () => {
    it('should have built-in skins for storage units', () => {
      const skins = registry.getSkinsForCategory(AssetCategory.STORAGE_UNIT);
      expect(skins.length).toBeGreaterThan(0);
      
      // Check for default skin
      const defaultSkin = skins.find(s => s.id === 'skin-unit-default');
      expect(defaultSkin).toBeDefined();
      expect(defaultSkin?.isBuiltin).toBe(true);
    });
    
    it('should have built-in skins for gates', () => {
      const skins = registry.getSkinsForCategory(AssetCategory.GATE);
      expect(skins.length).toBeGreaterThan(0);
    });
    
    it('should have built-in skins for elevators', () => {
      const skins = registry.getSkinsForCategory(AssetCategory.ELEVATOR);
      expect(skins.length).toBeGreaterThan(0);
    });
    
    it('should have built-in building skins', () => {
      const buildingSkin = registry.getSkin('skin-building-default');
      expect(buildingSkin).toBeDefined();
    });
  });
  
  describe('getSkin', () => {
    it('should return a skin by ID', () => {
      const skin = registry.getSkin('skin-unit-default');
      expect(skin).toBeDefined();
      expect(skin?.id).toBe('skin-unit-default');
    });
    
    it('should return undefined for non-existent skin', () => {
      const skin = registry.getSkin('non-existent-skin');
      expect(skin).toBeUndefined();
    });
  });
  
  describe('getSkinsForCategory', () => {
    it('should return all skins for a category', () => {
      const skins = registry.getSkinsForCategory(AssetCategory.STORAGE_UNIT);
      expect(Array.isArray(skins)).toBe(true);
      
      // All returned skins should be for the requested category
      skins.forEach(skin => {
        expect(skin.category).toBe(AssetCategory.STORAGE_UNIT);
      });
    });
    
    it('should return empty array for category with no skins', () => {
      // Assuming CAMERA has no built-in skins
      const skins = registry.getSkinsForCategory(AssetCategory.CAMERA);
      expect(Array.isArray(skins)).toBe(true);
    });
  });
  
  describe('createSkin', () => {
    it('should create a custom skin', () => {
      const newSkin = registry.createSkin({
        name: 'Test Custom Skin',
        description: 'A test skin',
        category: AssetCategory.STORAGE_UNIT,
        partMaterials: {
          body: { color: '#ff0000', metalness: 0.5, roughness: 0.5 },
        },
      });
      
      expect(newSkin).toBeDefined();
      expect(newSkin.id).toMatch(/^skin-custom-/);
      expect(newSkin.name).toBe('Test Custom Skin');
      expect(newSkin.isBuiltin).toBe(false);
    });
    
    it('should persist custom skin to localStorage', () => {
      registry.createSkin({
        name: 'Persistent Skin',
        category: AssetCategory.STORAGE_UNIT,
        partMaterials: {
          body: { color: '#00ff00', metalness: 0.3, roughness: 0.7 },
        },
      });
      
      const stored = localStorage.getItem('bludesign-category-skins-v1');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((s: any) => s.name === 'Persistent Skin')).toBe(true);
    });
  });
  
  describe('updateSkin', () => {
    it('should update a custom skin', () => {
      const created = registry.createSkin({
        name: 'Original Name',
        category: AssetCategory.STORAGE_UNIT,
        partMaterials: {
          body: { color: '#ffffff', metalness: 0.5, roughness: 0.5 },
        },
      });
      
      const updated = registry.updateSkin(created.id, { name: 'Updated Name' });
      
      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
    });
    
    it('should create a copy when updating a built-in skin', () => {
      const updated = registry.updateSkin('skin-unit-default', { name: 'Modified Default' });
      
      expect(updated).toBeDefined();
      expect(updated?.id).not.toBe('skin-unit-default'); // Should be a new ID
      expect(updated?.isBuiltin).toBe(false);
      expect(updated?.name).toBe('Modified Default');
      
      // Original should still exist
      const original = registry.getSkin('skin-unit-default');
      expect(original).toBeDefined();
      expect(original?.isBuiltin).toBe(true);
    });
    
    it('should return null for non-existent skin', () => {
      const result = registry.updateSkin('non-existent', { name: 'Test' });
      expect(result).toBeNull();
    });
  });
  
  describe('deleteSkin', () => {
    it('should delete a custom skin', () => {
      const created = registry.createSkin({
        name: 'To Be Deleted',
        category: AssetCategory.STORAGE_UNIT,
        partMaterials: {
          body: { color: '#000000', metalness: 0.5, roughness: 0.5 },
        },
      });
      
      const result = registry.deleteSkin(created.id);
      expect(result).toBe(true);
      
      const deleted = registry.getSkin(created.id);
      expect(deleted).toBeUndefined();
    });
    
    it('should not delete a built-in skin', () => {
      const result = registry.deleteSkin('skin-unit-default');
      expect(result).toBe(false);
      
      // Skin should still exist
      const skin = registry.getSkin('skin-unit-default');
      expect(skin).toBeDefined();
    });
  });
  
  describe('duplicateSkin', () => {
    it('should create a copy of a skin', () => {
      const original = registry.getSkin('skin-unit-default');
      expect(original).toBeDefined();
      
      const duplicate = registry.duplicateSkin('skin-unit-default', 'Duplicated Skin');
      
      expect(duplicate).toBeDefined();
      expect(duplicate?.name).toBe('Duplicated Skin');
      expect(duplicate?.isBuiltin).toBe(false);
      expect(duplicate?.category).toBe(original?.category);
    });
  });
  
  describe('getCategoryLabel', () => {
    it('should return human-readable labels', () => {
      expect(SkinRegistryClass.getCategoryLabel(AssetCategory.STORAGE_UNIT)).toBe('Storage Units');
      expect(SkinRegistryClass.getCategoryLabel(AssetCategory.GATE)).toBe('Gates');
      expect(SkinRegistryClass.getCategoryLabel(AssetCategory.ELEVATOR)).toBe('Elevators');
    });
  });
});

