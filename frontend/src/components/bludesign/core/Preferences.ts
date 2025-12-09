/**
 * BluDesign Editor Preferences
 * 
 * User preferences stored in localStorage for the editor.
 */

export interface EditorPreferences {
  // Floor ghosting settings
  floorGhosting: {
    floorsAboveOpacity: number; // 0-1, default 0.2
    floorsBelowOpacity: number; // 0-1, default 0.2
    fullBuildingViewOpacity: number; // 0-1, opacity when viewing all floors, default 1.0
    currentFloorWallOpacity: number; // 0-1, opacity for walls on current floor, default 0.5
  };
  
  // Grid settings
  grid: {
    defaultVisible: boolean;
    fadeDistance: number;
  };
  
  // Performance settings
  performance: {
    maxUndoSteps: number;
    autoSaveInterval: number; // seconds, 0 = disabled
  };
}

const STORAGE_KEY = 'bludesign-preferences';

const DEFAULT_PREFERENCES: EditorPreferences = {
  floorGhosting: {
    floorsAboveOpacity: 0.2,
    floorsBelowOpacity: 0.2,
    fullBuildingViewOpacity: 1.0,
    currentFloorWallOpacity: 0.5, // Walls on current floor semi-transparent to see inside
  },
  grid: {
    defaultVisible: true,
    fadeDistance: 50,
  },
  performance: {
    maxUndoSteps: 100,
    autoSaveInterval: 30,
  },
};

/**
 * Load preferences from localStorage
 */
export function loadPreferences(): EditorPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new properties
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        floorGhosting: {
          ...DEFAULT_PREFERENCES.floorGhosting,
          ...parsed.floorGhosting,
        },
        grid: {
          ...DEFAULT_PREFERENCES.grid,
          ...parsed.grid,
        },
        performance: {
          ...DEFAULT_PREFERENCES.performance,
          ...parsed.performance,
        },
      };
    }
  } catch (error) {
    console.warn('Failed to load preferences:', error);
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Save preferences to localStorage
 */
export function savePreferences(prefs: EditorPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): EditorPreferences {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Get default preferences
 */
export function getDefaultPreferences(): EditorPreferences {
  return { ...DEFAULT_PREFERENCES };
}

