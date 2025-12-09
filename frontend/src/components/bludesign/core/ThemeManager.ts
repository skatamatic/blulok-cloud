/**
 * Theme Manager
 * 
 * Manages global scene themes which are bundles of skins per asset category.
 * Supports both localStorage caching and backend API sync.
 * 
 * Hierarchy:
 * 1. Per-Instance Override (skinId on PlacedObject) - highest priority
 * 2. Theme's Category Skin (skin assigned for that category in the theme)
 * 3. Default materials (fallback)
 */

import { AssetCategory, PartMaterial } from './types';
import { BuildingSkinType } from './types';
import * as bludesignApi from '@/api/bludesign';

/**
 * Theme - a bundle of skins for each category
 */
export interface Theme {
  id: string;
  name: string;
  description: string;
  
  // Skin assignments per category (skinId or null for default)
  categorySkins: Partial<Record<AssetCategory, string>>;
  
  // Building skin type (legacy/default)
  buildingSkin: BuildingSkinType;
  // Optional custom building skin (CategorySkin with category=BUILDING)
  buildingSkinId?: string;
  
  // Environment settings (direct materials, not skins)
  environment: {
    grass: PartMaterial;
    pavement: PartMaterial;
    gravel: PartMaterial;
  };
  
  // Metadata
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Built-in themes using the skin-based structure */
const BUILTIN_THEMES: Theme[] = [
  {
    id: 'theme-default',
    name: 'Default',
    description: 'Clean, professional storage facility look',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-default',
      [AssetCategory.GATE]: 'skin-gate-default',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-default',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-default',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.DEFAULT,
    buildingSkinId: 'skin-building-default',
    environment: {
      grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#505860', metalness: 0.02, roughness: 0.85 },
      gravel: { color: '#a8957a', metalness: 0.05, roughness: 0.95 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-blue-steel',
    name: 'Blue Steel',
    description: 'Professional blue-themed facility',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-blue',
      [AssetCategory.GATE]: 'skin-gate-chrome',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-chrome',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-modern',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.DEFAULT,
    buildingSkinId: 'skin-building-default',
    environment: {
      grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#4a5568', metalness: 0.05, roughness: 0.8 },
      gravel: { color: '#6b7280', metalness: 0.1, roughness: 0.9 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-industrial',
    name: 'Industrial',
    description: 'Modern industrial warehouse aesthetic',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-charcoal',
      [AssetCategory.GATE]: 'skin-gate-black',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-black',
      [AssetCategory.ELEVATOR]: 'skin-elevator-default',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-industrial',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.METAL,
    buildingSkinId: 'skin-building-metal',
    environment: {
      grass: { color: '#365834', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#374151', metalness: 0.1, roughness: 0.8 },
      gravel: { color: '#6b7280', metalness: 0.1, roughness: 0.9 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-warm-orange',
    name: 'Warm Orange',
    description: 'Warm orange storage facility',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-orange',
      [AssetCategory.GATE]: 'skin-gate-default',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-gold',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-default',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.BRICK,
    buildingSkinId: 'skin-building-brick',
    environment: {
      grass: { color: '#4a6741', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#78716c', metalness: 0.0, roughness: 0.85 },
      gravel: { color: '#a8a29e', metalness: 0.0, roughness: 0.95 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-forest',
    name: 'Forest Green',
    description: 'Natural green facility',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-green',
      [AssetCategory.GATE]: 'skin-gate-default',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-default',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-default',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.DEFAULT,
    buildingSkinId: 'skin-building-default',
    environment: {
      grass: { color: '#2d5a2d', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#4a5a4a', metalness: 0.0, roughness: 0.85 },
      gravel: { color: '#7a8a7a', metalness: 0.0, roughness: 0.95 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-glass',
    name: 'Glass Building',
    description: 'Modern glass facade buildings',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-default',
      [AssetCategory.GATE]: 'skin-gate-chrome',
      [AssetCategory.DOOR]: 'skin-door-white',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-chrome',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-modern',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.GLASS,
    buildingSkinId: 'skin-building-glass',
    environment: {
      grass: { color: '#3d8a3d', metalness: 0.0, roughness: 0.9 },
      pavement: { color: '#4a5a6a', metalness: 0.15, roughness: 0.6 },
      gravel: { color: '#8090a0', metalness: 0.1, roughness: 0.8 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'theme-concrete',
    name: 'Modern Concrete',
    description: 'Sleek brutalist concrete aesthetic',
    categorySkins: {
      [AssetCategory.STORAGE_UNIT]: 'skin-unit-charcoal',
      [AssetCategory.GATE]: 'skin-gate-chrome',
      [AssetCategory.DOOR]: 'skin-door-default',
      [AssetCategory.FENCE]: 'skin-fence-default',
      [AssetCategory.ELEVATOR]: 'skin-elevator-default',
      [AssetCategory.STAIRWELL]: 'skin-stairwell-modern',
      [AssetCategory.KIOSK]: 'skin-kiosk-default',
    },
    buildingSkin: BuildingSkinType.CONCRETE,
    buildingSkinId: 'skin-building-concrete',
    environment: {
      grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
      pavement: { color: '#606060', metalness: 0.05, roughness: 0.8 },
      gravel: { color: '#808080', metalness: 0.05, roughness: 0.9 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export class ThemeManager {
  // Themes map
  private themes: Map<string, Theme> = new Map();
  
  private activeThemeId: string = 'theme-default';
  
  // Callback to notify when theme changes (to update scene)
  private onThemeChangeCallbacks: Array<(theme: Theme) => void> = [];
  
  constructor() {
    // Load built-in themes
    BUILTIN_THEMES.forEach(theme => {
      this.themes.set(theme.id, theme);
    });
    
    // Load custom themes from localStorage
    this.loadCustomThemes();
  }
  
  private loadCustomThemes(): void {
    try {
      const stored = localStorage.getItem('bludesign-custom-themes-v2');
      if (stored) {
        const customThemes: Theme[] = JSON.parse(stored);
        customThemes.forEach(theme => {
          theme.isBuiltin = false;
          theme.createdAt = new Date(theme.createdAt);
          theme.updatedAt = new Date(theme.updatedAt);
          this.themes.set(theme.id, theme);
        });
      }
    } catch (error) {
      console.error('Failed to load custom themes:', error);
    }
  }
  
  private saveCustomThemes(): void {
    try {
      const customThemes = Array.from(this.themes.values()).filter(t => !t.isBuiltin);
      localStorage.setItem('bludesign-custom-themes-v2', JSON.stringify(customThemes));
    } catch (error) {
      console.error('Failed to save custom themes:', error);
    }
  }
  
  /**
   * Get all available themes
   */
  getAllThemes(): Theme[] {
    return Array.from(this.themes.values());
  }
  
  /**
   * Alias for getAllThemes (for backward compatibility)
   */
  getAllSkinThemes(): Theme[] {
    return this.getAllThemes();
  }
  
  /**
   * Get built-in themes only
   */
  getBuiltinThemes(): Theme[] {
    return BUILTIN_THEMES;
  }
  
  /**
   * Get custom themes only
   */
  getCustomThemes(): Theme[] {
    return Array.from(this.themes.values()).filter(t => !t.isBuiltin);
  }
  
  /**
   * Get a theme by ID
   */
  getTheme(themeId: string): Theme | undefined {
    return this.themes.get(themeId);
  }
  
  /**
   * Alias for getTheme (for backward compatibility)
   */
  getSkinTheme(themeId: string): Theme | undefined {
    return this.getTheme(themeId);
  }
  
  /**
   * Get the currently active theme
   */
  getActiveTheme(): Theme {
    return this.themes.get(this.activeThemeId) || BUILTIN_THEMES[0];
  }
  
  /**
   * Alias for getActiveTheme (for backward compatibility)
   */
  getActiveSkinTheme(): Theme {
    return this.getActiveTheme();
  }
  
  /**
   * Get the active theme ID
   */
  getActiveThemeId(): string {
    return this.activeThemeId;
  }
  
  /**
   * Set the active theme and notify listeners
   */
  setActiveTheme(themeId: string): void {
    if (!this.themes.has(themeId)) {
      console.warn(`Theme ${themeId} not found, using default`);
      themeId = 'theme-default';
    }
    
    this.activeThemeId = themeId;
    const theme = this.getActiveTheme();
    this.onThemeChangeCallbacks.forEach(cb => cb(theme));
  }
  
  /**
   * Register a callback for theme changes
   */
  onThemeChange(callback: (theme: Theme) => void): () => void {
    this.onThemeChangeCallbacks.push(callback);
    return () => {
      const index = this.onThemeChangeCallbacks.indexOf(callback);
      if (index >= 0) this.onThemeChangeCallbacks.splice(index, 1);
    };
  }
  
  /**
   * Get the skin ID assigned to a category in a theme
   */
  getSkinForCategory(themeId: string, category: AssetCategory): string | null {
    const theme = this.themes.get(themeId);
    if (!theme) return null;
    return theme.categorySkins[category] || null;
  }
  
  /**
   * Get the skin ID assigned to a category in the active theme
   */
  getActiveSkinForCategory(category: AssetCategory): string | null {
    const theme = this.getActiveTheme();
    return theme.categorySkins[category] || null;
  }
  
  /**
   * Set the skin for a category in a custom theme
   */
  setSkinForCategory(themeId: string, category: AssetCategory, skinId: string | null): boolean {
    const theme = this.themes.get(themeId);
    if (!theme || theme.isBuiltin) return false;
    
    if (skinId) {
      theme.categorySkins[category] = skinId;
    } else {
      delete theme.categorySkins[category];
    }
    
    theme.updatedAt = new Date();
    this.saveCustomThemes();
    
    // Notify listeners if this is the active theme
    if (themeId === this.activeThemeId) {
      this.onThemeChangeCallbacks.forEach(cb => cb(theme));
    }
    
    return true;
  }
  
  /**
   * Create a new custom theme
   */
  createTheme(name: string, baseThemeId?: string): Theme {
    const base = baseThemeId ? this.themes.get(baseThemeId) : this.getActiveTheme();
    
    const newTheme: Theme = {
      id: `theme-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: `Custom theme based on ${base?.name || 'Default'}`,
      categorySkins: { ...(base?.categorySkins || {}) },
      buildingSkin: base?.buildingSkin || BuildingSkinType.DEFAULT,
      environment: base?.environment ? { ...base.environment } : {
        grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
        pavement: { color: '#505860', metalness: 0.02, roughness: 0.85 },
        gravel: { color: '#a8957a', metalness: 0.05, roughness: 0.95 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.themes.set(newTheme.id, newTheme);
    this.saveCustomThemes();
    
    return newTheme;
  }
  
  /**
   * Alias for createTheme (for backward compatibility)
   */
  createSkinTheme(name: string, baseThemeId?: string): Theme {
    return this.createTheme(name, baseThemeId);
  }
  
  /**
   * Update a theme. For built-in themes, creates a copy instead of modifying.
   * Returns the updated theme (or new copy for built-ins).
   */
  updateTheme(themeId: string, updates: Partial<Theme>): Theme | null {
    const theme = this.themes.get(themeId);
    if (!theme) return null;
    
    // For built-in themes, create a copy with the updates applied
    if (theme.isBuiltin) {
      const copiedTheme: Theme = {
        ...theme,
        ...updates,
        id: `theme-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: updates.name || `${theme.name} (Custom)`,
        isBuiltin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      this.themes.set(copiedTheme.id, copiedTheme);
      this.saveCustomThemes();
      
      return copiedTheme;
    }
    
    // For custom themes, update in place
    const updated: Theme = {
      ...theme,
      ...updates,
      id: theme.id, // Prevent ID change
      isBuiltin: false,
      updatedAt: new Date(),
    };
    
    this.themes.set(themeId, updated);
    this.saveCustomThemes();
    
    // If this is the active theme, notify listeners
    if (themeId === this.activeThemeId) {
      this.onThemeChangeCallbacks.forEach(cb => cb(updated));
    }
    
    return updated;
  }
  
  /**
   * Alias for updateTheme (for backward compatibility)
   */
  updateSkinTheme(themeId: string, updates: Partial<Theme>): Theme | null {
    return this.updateTheme(themeId, updates);
  }
  
  /**
   * Delete a custom theme
   */
  deleteTheme(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme || theme.isBuiltin) return false;
    
    this.themes.delete(themeId);
    this.saveCustomThemes();
    
    // If this was active, switch to default
    if (this.activeThemeId === themeId) {
      this.setActiveTheme('theme-default');
    }
    
    return true;
  }
  
  /**
   * Alias for deleteTheme (for backward compatibility)
   */
  deleteSkinTheme(themeId: string): boolean {
    return this.deleteTheme(themeId);
  }
  
  /**
   * Export state for saving
   */
  exportState(): { activeThemeId: string } {
    return {
      activeThemeId: this.activeThemeId,
    };
  }
  
  /**
   * Import state from saved data
   */
  importState(state: { activeThemeId: string }): void {
    this.activeThemeId = state.activeThemeId || 'theme-default';
    
    // Notify theme change
    const theme = this.getActiveTheme();
    this.onThemeChangeCallbacks.forEach(cb => cb(theme));
  }
  
  /**
   * Clear all state
   */
  clear(): void {
    this.activeThemeId = 'theme-default';
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.onThemeChangeCallbacks = [];
  }
  
  // ==========================================================================
  // Backend API Sync Methods
  // ==========================================================================
  
  private backendSyncEnabled = false;
  
  /**
   * Enable backend sync - fetches themes from backend and syncs future changes
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
   * Sync custom themes from backend to local state
   */
  async syncFromBackend(): Promise<void> {
    if (!this.backendSyncEnabled) return;
    
    try {
      const backendThemes = await bludesignApi.getThemes();
      
      // Merge backend themes with local state
      for (const apiTheme of backendThemes) {
        const theme: Theme = {
          id: apiTheme.id,
          name: apiTheme.name,
          description: apiTheme.description || '',
          categorySkins: apiTheme.categorySkins as Partial<Record<AssetCategory, string>>,
          buildingSkin: (apiTheme.buildingSkin as BuildingSkinType) || BuildingSkinType.DEFAULT,
          buildingSkinId: apiTheme.buildingSkinId,
          environment: apiTheme.environment as Theme['environment'] || {
            grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
            pavement: { color: '#505860', metalness: 0.02, roughness: 0.85 },
            gravel: { color: '#a8957a', metalness: 0.05, roughness: 0.95 },
          },
          isBuiltin: false,
          createdAt: apiTheme.createdAt,
          updatedAt: apiTheme.updatedAt,
        };
        
        this.themes.set(theme.id, theme);
      }
      
      // Save to localStorage as cache
      this.saveCustomThemes();
    } catch (error) {
      console.warn('Failed to sync themes from backend:', error);
    }
  }
  
  /**
   * Create a new theme and optionally sync to backend
   */
  async createThemeAsync(name: string, baseThemeId?: string): Promise<Theme> {
    const theme = this.createTheme(name, baseThemeId);
    
    if (this.backendSyncEnabled) {
      try {
        const apiTheme = await bludesignApi.createTheme({
          name: theme.name,
          description: theme.description,
          categorySkins: theme.categorySkins as Record<string, string | null>,
          buildingSkin: theme.buildingSkin,
          buildingSkinId: theme.buildingSkinId,
          environment: theme.environment,
        });
        
        // Update local theme with backend ID
        this.themes.delete(theme.id);
        theme.id = apiTheme.id;
        this.themes.set(theme.id, theme);
        this.saveCustomThemes();
      } catch (error) {
        console.warn('Failed to sync new theme to backend:', error);
      }
    }
    
    return theme;
  }
  
  /**
   * Update a theme and optionally sync to backend
   */
  async updateThemeAsync(themeId: string, updates: Partial<Theme>): Promise<Theme | null> {
    const result = this.updateTheme(themeId, updates);
    
    if (result && this.backendSyncEnabled && !result.isBuiltin) {
      try {
        await bludesignApi.updateThemeApi(result.id, {
          name: result.name,
          description: result.description,
          categorySkins: result.categorySkins as Record<string, string | null>,
          buildingSkin: result.buildingSkin,
          buildingSkinId: result.buildingSkinId,
          environment: result.environment,
        });
      } catch (error) {
        console.warn('Failed to sync theme update to backend:', error);
      }
    }
    
    return result;
  }
  
  /**
   * Delete a theme and optionally sync to backend
   */
  async deleteThemeAsync(themeId: string): Promise<boolean> {
    const theme = this.themes.get(themeId);
    const wasBackendTheme = theme && !theme.isBuiltin && themeId.startsWith('theme-custom-');
    
    const result = this.deleteTheme(themeId);
    
    if (result && this.backendSyncEnabled && wasBackendTheme) {
      try {
        await bludesignApi.deleteThemeApi(themeId);
      } catch (error) {
        console.warn('Failed to sync theme deletion to backend:', error);
      }
    }
    
    return result;
  }
}

// Singleton instance
let themeManagerInstance: ThemeManager | null = null;

/**
 * Get the global ThemeManager instance
 */
export function getThemeManager(): ThemeManager {
  if (!themeManagerInstance) {
    themeManagerInstance = new ThemeManager();
  }
  return themeManagerInstance;
}
