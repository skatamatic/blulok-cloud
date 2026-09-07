/**
 * ThemeManager Tests
 * 
 * Tests for the theme management system that handles global scene themes.
 */

import { ThemeManager } from '../../../components/bludesign/core/ThemeManager';
import { AssetCategory } from '../../../components/bludesign/core/types';

describe('ThemeManager', () => {
  let manager: ThemeManager;
  
  beforeEach(() => {
    // Create a fresh instance for each test
    manager = new ThemeManager();
    
    // Clear localStorage to ensure clean state
    localStorage.removeItem('bludesign-custom-themes-v2');
    localStorage.removeItem('bludesign-active-theme');
  });
  
  describe('Built-in Themes', () => {
    it('should have built-in themes', () => {
      const themes = manager.getAllThemes();
      expect(themes.length).toBeGreaterThan(0);
    });
    
    it('should have a default theme', () => {
      const defaultTheme = manager.getTheme('theme-default');
      expect(defaultTheme).toBeDefined();
      expect(defaultTheme?.isBuiltin).toBe(true);
      expect(defaultTheme?.name).toBe('Default');
    });
    
    it('should have category skins defined in themes', () => {
      const theme = manager.getTheme('theme-default');
      expect(theme?.categorySkins).toBeDefined();
      expect(theme?.categorySkins[AssetCategory.STORAGE_UNIT]).toBeDefined();
    });
    
    it('should have environment settings in themes', () => {
      const theme = manager.getTheme('theme-default');
      expect(theme?.environment).toBeDefined();
      expect(theme?.environment.grass).toBeDefined();
      expect(theme?.environment.pavement).toBeDefined();
      expect(theme?.environment.gravel).toBeDefined();
    });
  });
  
  describe('getActiveTheme', () => {
    it('should return the default theme initially', () => {
      const active = manager.getActiveTheme();
      expect(active.id).toBe('theme-default');
    });
    
    it('should return the set active theme', () => {
      manager.setActiveTheme('theme-blue-steel');
      const active = manager.getActiveTheme();
      expect(active.id).toBe('theme-blue-steel');
    });
  });
  
  describe('setActiveTheme', () => {
    it('should change the active theme', () => {
      manager.setActiveTheme('theme-industrial');
      expect(manager.getActiveTheme().id).toBe('theme-industrial');
    });
    
    it('should notify listeners on theme change', () => {
      const listener = jest.fn();
      manager.onThemeChange(listener);
      
      manager.setActiveTheme('theme-industrial');
      
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].id).toBe('theme-industrial');
    });
    
    it('should fall back to default if theme not found', () => {
      manager.setActiveTheme('non-existent-theme');
      expect(manager.getActiveTheme().id).toBe('theme-default');
    });
  });
  
  describe('createTheme', () => {
    it('should create a new custom theme', () => {
      const newTheme = manager.createTheme('My Custom Theme');
      
      expect(newTheme).toBeDefined();
      expect(newTheme.id).toMatch(/^theme-custom-/);
      expect(newTheme.name).toBe('My Custom Theme');
      expect(newTheme.isBuiltin).toBe(false);
    });
    
    it('should base new theme on active theme', () => {
      manager.setActiveTheme('theme-industrial');
      const newTheme = manager.createTheme('Based On Industrial');
      
      expect(newTheme.buildingSkin).toBe(manager.getTheme('theme-industrial')?.buildingSkin);
    });
    
    it('should persist custom theme to localStorage', () => {
      manager.createTheme('Persistent Theme');
      
      const stored = localStorage.getItem('bludesign-custom-themes-v2');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((t: any) => t.name === 'Persistent Theme')).toBe(true);
    });
  });
  
  describe('updateTheme', () => {
    it('should update a custom theme', () => {
      const created = manager.createTheme('Original Name');
      const updated = manager.updateTheme(created.id, { name: 'Updated Name' });
      
      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
    });
    
    it('should create a copy when updating a built-in theme', () => {
      const updated = manager.updateTheme('theme-default', { name: 'Modified Default' });
      
      expect(updated).toBeDefined();
      expect(updated?.id).not.toBe('theme-default'); // Should be a new ID
      expect(updated?.isBuiltin).toBe(false);
      expect(updated?.name).toBe('Modified Default');
      
      // Original should still exist
      const original = manager.getTheme('theme-default');
      expect(original).toBeDefined();
      expect(original?.isBuiltin).toBe(true);
    });
    
    it('should notify listeners when active theme is updated', () => {
      const created = manager.createTheme('Test Theme');
      manager.setActiveTheme(created.id);
      
      const listener = jest.fn();
      manager.onThemeChange(listener);
      
      manager.updateTheme(created.id, { name: 'Updated Theme Name' });
      
      expect(listener).toHaveBeenCalled();
    });
  });
  
  describe('deleteTheme', () => {
    it('should delete a custom theme', () => {
      const created = manager.createTheme('To Be Deleted');
      const result = manager.deleteTheme(created.id);
      
      expect(result).toBe(true);
      expect(manager.getTheme(created.id)).toBeUndefined();
    });
    
    it('should not delete a built-in theme', () => {
      const result = manager.deleteTheme('theme-default');
      expect(result).toBe(false);
      
      // Theme should still exist
      expect(manager.getTheme('theme-default')).toBeDefined();
    });
    
    it('should switch to default if active theme is deleted', () => {
      const created = manager.createTheme('Active Theme');
      manager.setActiveTheme(created.id);
      
      manager.deleteTheme(created.id);
      
      expect(manager.getActiveTheme().id).toBe('theme-default');
    });
  });
  
  describe('getSkinForCategory', () => {
    it('should return skin ID for a category in a theme', () => {
      const skinId = manager.getSkinForCategory('theme-default', AssetCategory.STORAGE_UNIT);
      expect(skinId).toBeDefined();
      expect(typeof skinId).toBe('string');
    });
    
    it('should return null if category not defined in theme', () => {
      // Create a theme with minimal category skins
      const created = manager.createTheme('Minimal Theme');
      manager.updateTheme(created.id, { categorySkins: {} });
      
      const skinId = manager.getSkinForCategory(created.id, AssetCategory.CAMERA);
      expect(skinId).toBeNull();
    });
  });
  
  describe('onThemeChange', () => {
    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = manager.onThemeChange(listener);
      
      expect(typeof unsubscribe).toBe('function');
      
      manager.setActiveTheme('theme-industrial');
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      manager.setActiveTheme('theme-default');
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });
  
  describe('exportState/importState', () => {
    it('should export and import state correctly', () => {
      manager.setActiveTheme('theme-industrial');
      const exported = manager.exportState();
      
      expect(exported.activeThemeId).toBe('theme-industrial');
      
      // Create new manager and import
      const newManager = new ThemeManager();
      newManager.importState(exported);
      
      expect(newManager.getActiveTheme().id).toBe('theme-industrial');
    });
  });
});

