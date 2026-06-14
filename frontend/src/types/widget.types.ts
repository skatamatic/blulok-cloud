/**
 * Shared widget type definitions for backend and frontend consistency
 * This file should be kept in sync with backend/src/types/widget.types.ts
 */

export type WidgetSize =
  | 'tiny'
  | 'small'
  | 'medium'
  | 'medium-tall'
  | 'large'
  | 'huge'
  | 'large-wide'
  | 'huge-wide'
  | 'mega-tall'
  | 'dock-top'
  | 'dock-bottom'
  | 'dock-left'
  | 'dock-right'
  | 'dock-bottom-two-thirds'
  | 'dock-full';

export type WidgetCategory = 'analytics' | 'status' | 'activity' | 'system';

export interface WidgetTypeDefinition {
  type: string;
  name: string;
  description: string;
  defaultSize: WidgetSize;
  availableSizes: WidgetSize[];
  allowMultiple: boolean;
  category: WidgetCategory;
  requiredPermissions?: string[];
  /** When true, the widget can enter a runtime fullscreen "focus" mode covering the entire dashboard. */
  supportsFullscreen?: boolean;
}

/**
 * Standard widget types - these are the canonical types used throughout the system
 * Both backend and frontend should use these exact type strings
 */
export const WIDGET_TYPES = {
  // Stats widgets
  'stats-facilities': 'stats-facilities',
  'stats-devices': 'stats-devices', 
  'stats-users': 'stats-users',
  'stats-alerts': 'stats-alerts',
  
  // Activity widgets
  'activity-monitor': 'activity-monitor',
  'access-history': 'access-history',
  
  // Status widgets
  'notifications': 'notifications',
  'battery-status': 'battery-status',
  'unlocked-units': 'unlocked-units',
  'lock-status': 'lock-status',
  'shared-keys': 'shared-keys',
  'daily-access-codes': 'daily-access-codes',
  
  // System widgets
  'remote-gate': 'remote-gate',
  'sync-fms': 'sync-fms',
  
  // Analytics widgets
  'histogram': 'histogram',
  
  // Visualization widgets
  'facility-viewer': 'facility-viewer',

  // Management widgets
  'units-manager': 'units-manager',
} as const;

export type WidgetType = typeof WIDGET_TYPES[keyof typeof WIDGET_TYPES];

/**
 * Widget type registry with full definitions
 * This should match the backend widget registry exactly
 */
export const WIDGET_REGISTRY: Record<WidgetType, WidgetTypeDefinition> = {
  'stats-facilities': {
    type: 'stats-facilities',
    name: 'Facilities Count',
    description: 'Total number of facilities',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'stats-devices': {
    type: 'stats-devices',
    name: 'Active Devices', 
    description: 'Number of active devices',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'stats-users': {
    type: 'stats-users',
    name: 'Registered Users',
    description: 'Total registered users',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'stats-alerts': {
    type: 'stats-alerts',
    name: 'Active Alerts',
    description: 'Current active alerts',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'activity-monitor': {
    type: 'activity-monitor',
    name: 'Activity Monitor',
    description: 'Real-time activity log and monitoring',
    defaultSize: 'medium-tall',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide', 'dock-top', 'dock-bottom', 'dock-left', 'dock-right', 'dock-bottom-two-thirds'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'access-history': {
    type: 'access-history',
    name: 'Access History',
    description: 'Recent access events for your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['tenant', 'admin', 'facility_admin', 'maintenance']
  },
  'notifications': {
    type: 'notifications',
    name: 'Notifications',
    description: 'System alerts and notifications',
    defaultSize: 'medium-tall',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'facility_admin', 'maintenance']
  },
  'battery-status': {
    type: 'battery-status',
    name: 'Battery Status',
    description: 'Monitor device battery levels',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'medium-tall', 'large'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance', 'tenant']
  },
  'unlocked-units': {
    type: 'unlocked-units',
    name: 'Unlocked Units',
    description: 'Security alert for unlocked units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'medium-tall', 'large', 'large-wide', 'huge'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance', 'tenant']
  },
  'lock-status': {
    type: 'lock-status',
    name: 'Lock Status',
    description: 'Control locks for all your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'dev_admin', 'facility_admin', 'maintenance']
  },
  'shared-keys': {
    type: 'shared-keys',
    name: 'Shared Keys Overview',
    description: 'Manage shared access to your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'facility_admin', 'maintenance']
  },
  'daily-access-codes': {
    type: 'daily-access-codes',
    name: 'Daily Access Codes',
    description: 'View and refresh active keypad access codes',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'medium-tall', 'large'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'dev_admin', 'facility_admin', 'maintenance']
  },
  'remote-gate': {
    type: 'remote-gate',
    name: 'Remote Gate Control',
    description: 'Control facility gates remotely',
    defaultSize: 'medium',
    availableSizes: ['medium', 'large'],
    allowMultiple: false,
    category: 'system',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'sync-fms': {
    type: 'sync-fms',
    name: 'FMS Sync',
    description: 'Synchronize customer data with FMS',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'system',
    requiredPermissions: ['admin', 'dev_admin', 'facility_admin', 'maintenance']
  },
  'histogram': {
    type: 'histogram',
    name: 'Activity Histogram',
    description: 'Site activity over time',
    defaultSize: 'large-wide',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide', 'dock-top', 'dock-bottom', 'dock-bottom-two-thirds'],
    allowMultiple: true,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance']
  },
  'facility-viewer': {
    type: 'facility-viewer',
    name: 'Facility 3D View',
    description: 'Interactive 3D visualization of linked facility with real-time lock status',
    defaultSize: 'huge',
    availableSizes: ['huge', 'huge-wide', 'dock-left', 'dock-right', 'dock-bottom-two-thirds', 'dock-full'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin', 'maintenance'],
    supportsFullscreen: true,
  },
  'units-manager': {
    type: 'units-manager',
    name: 'Units Manager',
    description: 'Live unit grid with lock state, battery, signal, tenant, and one-tap remote unlock',
    defaultSize: 'dock-bottom',
    availableSizes: [
      'large',
      'large-wide',
      'huge',
      'huge-wide',
      'dock-top',
      'dock-bottom',
      'dock-bottom-two-thirds',
      'dock-left',
      'dock-right',
      'dock-full',
    ],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'dev_admin', 'facility_admin', 'maintenance'],
    supportsFullscreen: true,
  }
};

/** Persisted view settings for the Facility 3D View dashboard widget */
export type FacilityViewerSkyPreset = 'blank' | 'day' | 'sunset' | 'night' | 'natural';
export type FacilityViewerGroundPreset = 'blank' | 'grid' | 'grass' | 'concrete' | 'natural';

export interface FacilityViewerWidgetConfig {
  skyPreset?: FacilityViewerSkyPreset;
  groundPreset?: FacilityViewerGroundPreset;
}

export const DEFAULT_FACILITY_VIEWER_CONFIG: FacilityViewerWidgetConfig = {
  skyPreset: 'blank',
  groundPreset: 'blank',
};

/**
 * Helper functions for widget type management
 */
export class WidgetTypeHelper {
  /**
   * Get widget type definition
   */
  static getWidgetType(type: string): WidgetTypeDefinition | undefined {
    return WIDGET_REGISTRY[type as WidgetType];
  }

  /**
   * Check if a widget type is valid
   */
  static isValidWidgetType(type: string): type is WidgetType {
    return type in WIDGET_REGISTRY;
  }

  /**
   * Get all widget types for a specific category
   */
  static getWidgetsByCategory(category: WidgetCategory): WidgetTypeDefinition[] {
    return Object.values(WIDGET_REGISTRY).filter(widget => widget.category === category);
  }

  /**
   * Get all available widget types
   */
  static getAllWidgetTypes(): WidgetTypeDefinition[] {
    return Object.values(WIDGET_REGISTRY);
  }

  /**
   * Get widget types available for a specific user role
   */
  static getAvailableForRole(userRole: string): WidgetTypeDefinition[] {
    return Object.values(WIDGET_REGISTRY).filter(widget => {
      if (!widget.requiredPermissions || widget.requiredPermissions.length === 0) {
        return true; // No permissions required
      }
      return widget.requiredPermissions.includes(userRole);
    });
  }

  /**
   * Extract widget type from widget ID (for backward compatibility)
   * This should be used sparingly - prefer using the canonical widget types
   */
  static extractWidgetTypeFromId(widgetId: string): string {
    if (widgetId.includes('units-manager') || widgetId.includes('units_manager')) {
      return WIDGET_TYPES['units-manager'];
    }
    // Map old widget ID patterns to new canonical types
    if (widgetId.includes('facilities_stats') || widgetId.includes('facilities')) {
      return WIDGET_TYPES['stats-facilities'];
    }
    if (widgetId.includes('devices_stats') || widgetId.includes('devices')) {
      return WIDGET_TYPES['stats-devices'];
    }
    if (widgetId.includes('users_stats') || widgetId.includes('users')) {
      return WIDGET_TYPES['stats-users'];
    }
    if (widgetId.includes('alerts_stats') || widgetId.includes('alerts')) {
      return WIDGET_TYPES['stats-alerts'];
    }
    if (widgetId.includes('recent_activity') || widgetId.includes('activity')) {
      return WIDGET_TYPES['activity-monitor'];
    }
    if (widgetId.includes('system_status')) {
      return WIDGET_TYPES['stats-facilities'];
    }
    if (widgetId.includes('performance_stats') || widgetId.includes('performance')) {
      return WIDGET_TYPES['stats-devices'];
    }
    if (widgetId.includes('syncfms') || widgetId.includes('sync_fms')) {
      return WIDGET_TYPES['sync-fms'];
    }
    if (widgetId.includes('access_history') || widgetId.includes('accesshistory')) {
      return WIDGET_TYPES['access-history'];
    }
    if (widgetId.includes('shared_keys') || widgetId.includes('sharedkeys')) {
      return WIDGET_TYPES['shared-keys'];
    }
    if (widgetId.includes('unlocked_units') || widgetId.includes('unlockedunits')) {
      return WIDGET_TYPES['unlocked-units'];
    }
    if (widgetId.includes('battery_status') || widgetId.includes('batterystatus')) {
      return WIDGET_TYPES['battery-status'];
    }
    if (widgetId.includes('activity_monitor') || widgetId.includes('activitymonitor')) {
      return WIDGET_TYPES['activity-monitor'];
    }
    if (widgetId.includes('lock_status') || widgetId.includes('lockstatus')) {
      return WIDGET_TYPES['lock-status'];
    }
    if (widgetId.includes('notifications')) {
      return WIDGET_TYPES['notifications'];
    }
    
    // Fallback - return the widget ID as-is if it matches a canonical type
    if (this.isValidWidgetType(widgetId)) {
      return widgetId;
    }
    
    // Last resort - return unknown
    return 'unknown';
  }
}


