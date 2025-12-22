/**
 * Rendering Settings Manager
 * 
 * Centralized singleton for managing rendering performance settings.
 * Provides type-safe access to settings and event notifications when settings change.
 */

import { EditorPreferences, loadPreferences } from './Preferences';

export interface RenderingSettingsChangeEvent {
  type: 'instancing' | 'culling' | 'optimizer' | 'shadows' | 'antialiasing' | 'monitoring' | 'all';
  settings: Partial<EditorPreferences['rendering']>;
}

export class RenderingSettingsManager {
  private static instance: RenderingSettingsManager | null = null;
  private settings: EditorPreferences['rendering'];
  private listeners: Set<(event: RenderingSettingsChangeEvent) => void> = new Set();
  
  private constructor() {
    const prefs = loadPreferences();
    this.settings = prefs.rendering || this.getDefaults();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): RenderingSettingsManager {
    if (!this.instance) {
      this.instance = new RenderingSettingsManager();
    }
    return this.instance;
  }
  
  /**
   * Get all settings
   */
  getSettings(): EditorPreferences['rendering'] {
    return { ...this.settings };
  }
  
  /**
   * Update settings
   */
  updateSettings(updates: Partial<EditorPreferences['rendering']>): void {
    this.settings = { ...this.settings, ...updates };
    this.notifyListeners({ type: 'all', settings: this.settings });
  }
  
  /**
   * Reload settings from preferences
   */
  reloadFromPreferences(): void {
    const prefs = loadPreferences();
    const oldSettings = { ...this.settings };
    this.settings = prefs.rendering || this.getDefaults();
    
    // Notify if anything changed
    const changed = Object.keys(this.settings).some(
      key => (this.settings as any)[key] !== (oldSettings as any)[key]
    );
    
    if (changed) {
      this.notifyListeners({ type: 'all', settings: this.settings });
    }
  }
  
  // Convenience getters
  isInstancingEnabled(): boolean {
    return this.settings.instancingEnabled;
  }
  
  isFrustumCullingEnabled(): boolean {
    return this.settings.frustumCullingEnabled;
  }
  
  isOcclusionCullingEnabled(): boolean {
    return this.settings.occlusionCullingEnabled;
  }
  
  isOptimizerEnabled(): boolean {
    return this.settings.optimizerEnabled;
  }
  
  isShadowsEnabled(): boolean {
    return this.settings.shadowsEnabled;
  }
  
  getShadowDistance(): number {
    return this.settings.shadowDistance;
  }
  
  getShadowMapSize(): 1024 | 2048 | 4096 {
    return this.settings.shadowMapSize;
  }
  
  isAntialiasingEnabled(): boolean {
    return this.settings.antialiasingEnabled;
  }
  
  getAntialiasingLevel(): 0 | 2 | 4 | 8 {
    return this.settings.antialiasingLevel;
  }
  
  shouldShowFPS(): boolean {
    return this.settings.showFPS;
  }
  
  shouldShowGPUMemory(): boolean {
    return this.settings.showGPUMemory;
  }
  
  /**
   * Subscribe to settings changes
   * Returns unsubscribe function
   */
  onSettingsChange(listener: (event: RenderingSettingsChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  /**
   * Notify all listeners of settings change
   */
  private notifyListeners(event: RenderingSettingsChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[RenderingSettingsManager] Error in settings change listener:', error);
      }
    });
  }
  
  /**
   * Get default settings
   */
  private getDefaults(): EditorPreferences['rendering'] {
    return {
      instancingEnabled: true,
      frustumCullingEnabled: true,
      occlusionCullingEnabled: false,
      optimizerEnabled: true,
      shadowsEnabled: true,
      shadowDistance: 0,
      shadowMapSize: 2048,
      antialiasingEnabled: true,
      antialiasingLevel: 2,
      showFPS: false,
      showGPUMemory: false,
    };
  }
}

