/**
 * Rendering Settings Manager Tests
 */

import { RenderingSettingsManager } from '@/components/bludesign/core/RenderingSettingsManager';
import { savePreferences, resetPreferences } from '@/components/bludesign/core/Preferences';

describe('RenderingSettingsManager', () => {
  beforeEach(() => {
    // Reset preferences before each test
    resetPreferences();
    // Clear singleton instance (if possible)
    // Note: Singleton pattern makes this tricky, but settings reload from preferences
  });
  
  afterEach(() => {
    resetPreferences();
  });
  
  it('should be a singleton', () => {
    const instance1 = RenderingSettingsManager.getInstance();
    const instance2 = RenderingSettingsManager.getInstance();
    
    expect(instance1).toBe(instance2);
  });
  
  it('should load settings from preferences', () => {
    const manager = RenderingSettingsManager.getInstance();
    const settings = manager.getSettings();
    
    expect(settings.instancingEnabled).toBe(true);
    expect(settings.frustumCullingEnabled).toBe(true);
    expect(settings.optimizerEnabled).toBe(true);
    expect(settings.shadowsEnabled).toBe(true);
  });
  
  it('should update settings and notify listeners', () => {
    const manager = RenderingSettingsManager.getInstance();
    let notified = false;
    let notifiedSettings: any = null;
    
    const unsubscribe = manager.onSettingsChange((event) => {
      notified = true;
      notifiedSettings = event.settings;
    });
    
    manager.updateSettings({ instancingEnabled: false });
    
    expect(notified).toBe(true);
    expect(notifiedSettings).toHaveProperty('instancingEnabled', false);
    
    unsubscribe();
  });
  
  it('should provide convenience getters', () => {
    const manager = RenderingSettingsManager.getInstance();
    
    expect(manager.isInstancingEnabled()).toBe(true);
    expect(manager.isFrustumCullingEnabled()).toBe(true);
    expect(manager.isOptimizerEnabled()).toBe(true);
    expect(manager.isShadowsEnabled()).toBe(true);
    expect(manager.getShadowMapSize()).toBe(2048);
    expect(manager.getAntialiasingLevel()).toBe(2);
  });
  
  it('should reload from preferences', () => {
    const manager = RenderingSettingsManager.getInstance();
    
    // Update preferences directly
    const prefs = manager.getSettings();
    prefs.instancingEnabled = false;
    savePreferences({ rendering: prefs } as any);
    
    // Reload
    manager.reloadFromPreferences();
    
    expect(manager.isInstancingEnabled()).toBe(false);
  });
});
