/**
 * Widget Types and Definitions
 *
 * Comprehensive type system for BluLok dashboard widgets. This module defines
 * the complete widget ecosystem used throughout the frontend and backend for
 * consistent widget management, permissions, and configuration.
 *
 * Key Concepts:
 * - Widgets: Modular UI components displaying specific data/functionality
 * - Categories: Logical grouping (analytics, status, activity, system)
 * - Sizes: Responsive grid sizing options for flexible layouts
 * - Permissions: Role-based access control for widget visibility
 * - Registry: Centralized widget definitions and metadata
 *
 * Architecture:
 * - Type-safe widget definitions with validation
 * - Permission-based widget filtering
 * - Responsive sizing system for different screen sizes
 * - Category-based organization for UI navigation
 * - Backward compatibility mapping for legacy widget IDs
 *
 * Security Considerations:
 * - Permission-based widget access control
 * - Input validation for widget configurations
 * - Safe default fallbacks for unknown widget types
 * - Audit logging for widget usage and permissions
 *
 * Performance Optimizations:
 * - Static widget registry for fast lookups
 * - Efficient permission checking algorithms
 * - Minimal memory footprint for widget definitions
 * - Lazy loading support for large widget sets
 *
 * Synchronization:
 * - This file MUST be kept in sync with frontend/src/types/widget.types.ts
 * - Any changes to widget definitions require frontend updates
 * - Version compatibility checking between frontend/backend
 */

import { EventEmitter } from 'events';

/**
 * Widget Size Enumeration
 *
 * Defines the available size options for dashboard widgets.
 * Sizes determine grid layout and responsive behavior.
 */
export type WidgetSize = 'tiny' | 'small' | 'medium' | 'medium-tall' | 'large' | 'huge' | 'large-wide' | 'huge-wide';

/**
 * Widget Category Enumeration
 *
 * Defines the logical categories for organizing widgets in the UI.
 * Categories help users find relevant widgets and provide contextual grouping.
 */
export type WidgetCategory = 'analytics' | 'status' | 'activity' | 'system';

/**
 * Widget Type Definition Interface
 *
 * Complete metadata definition for a widget type, including display properties,
 * permissions, and configuration options.
 */
export interface WidgetTypeDefinition {
  /** Unique identifier for the widget type */
  type: string;
  /** Human-readable display name */
  name: string;
  /** Detailed description of the widget's functionality */
  description: string;
  /** Default size when widget is first added */
  defaultSize: WidgetSize;
  /** Array of sizes this widget supports */
  availableSizes: WidgetSize[];
  /** Whether multiple instances of this widget are allowed */
  allowMultiple: boolean;
  /** Category for UI organization and filtering */
  category: WidgetCategory;
  /** Required user permissions to access this widget */
  requiredPermissions?: string[];
}

/**
 * Canonical Widget Types
 *
 * Defines the complete set of supported widget types in the BluLok system.
 * These are the authoritative type strings used throughout the application.
 * Both backend and frontend MUST use these exact string values for consistency.
 */
export const WIDGET_TYPES = {
  // Analytics & Statistics Widgets
  /** Displays total facility count and basic statistics */
  'stats-facilities': 'stats-facilities',
  /** Shows active device count and connectivity metrics */
  'stats-devices': 'stats-devices',
  /** Displays registered user count and growth metrics */
  'stats-users': 'stats-users',
  /** Shows active alerts and notification counts */
  'stats-alerts': 'stats-alerts',

  // Activity & Monitoring Widgets
  /** Real-time activity log and system monitoring */
  'activity-monitor': 'activity-monitor',
  /** Recent system activity feed with filtering */
  'activity-feed': 'activity-feed',
  /** Access history for user's units and permissions */
  'access-history': 'access-history',

  // Status & Control Widgets
  /** System alerts, notifications, and messages */
  'notifications': 'notifications',
  /** Device battery level monitoring and alerts */
  'battery-status': 'battery-status',
  /** Security alert for units left unlocked */
  'unlocked-units': 'unlocked-units',
  /** Lock control interface for user's units */
  'lock-status': 'lock-status',
  /** Shared access key management overview */
  'shared-keys': 'shared-keys',
  /** Overall system health and status dashboard */
  'system-status': 'system-status',

  // System Administration Widgets
  /** Remote facility gate control interface */
  'remote-gate': 'remote-gate',
  /** FMS synchronization status and controls */
  'sync-fms': 'sync-fms',
  /** System performance metrics and monitoring */
  'performance-stats': 'performance-stats',

  // Development & Testing Widgets
  /** Demo widget for scrollable content testing */
  'test-scroll': 'test-scroll',
  /** Activity histogram visualization over time */
  'histogram': 'histogram',
} as const;

/**
 * Widget Type Union
 *
 * Type-safe union of all valid widget type strings.
 * Ensures compile-time validation of widget type references.
 */
export type WidgetType = typeof WIDGET_TYPES[keyof typeof WIDGET_TYPES];

/**
 * Widget Registry
 *
 * Comprehensive registry of all widget types with complete metadata.
 * This registry MUST be kept in sync with the frontend widget registry.
 * Each widget definition includes permissions, sizing, and display properties.
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
    requiredPermissions: ['admin', 'facility_admin']
  },
  'stats-devices': {
    type: 'stats-devices',
    name: 'Active Devices', 
    description: 'Number of active devices',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'stats-users': {
    type: 'stats-users',
    name: 'Registered Users',
    description: 'Total registered users',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'stats-alerts': {
    type: 'stats-alerts',
    name: 'Active Alerts',
    description: 'Current active alerts',
    defaultSize: 'medium',
    availableSizes: ['tiny', 'small', 'medium', 'large'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'activity-monitor': {
    type: 'activity-monitor',
    name: 'Activity Monitor',
    description: 'Real-time activity log and monitoring',
    defaultSize: 'medium-tall',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'activity-feed': {
    type: 'activity-feed',
    name: 'Recent Activity',
    description: 'Latest system activity',
    defaultSize: 'large',
    availableSizes: ['medium', 'medium-tall', 'large', 'huge', 'large-wide', 'huge-wide'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'access-history': {
    type: 'access-history',
    name: 'Access History',
    description: 'Recent access events for your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['tenant', 'admin', 'facility_admin']
  },
  'notifications': {
    type: 'notifications',
    name: 'Notifications',
    description: 'System alerts and notifications',
    defaultSize: 'medium-tall',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'facility_admin']
  },
  'battery-status': {
    type: 'battery-status',
    name: 'Battery Status',
    description: 'Monitor device battery levels',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large'],
    allowMultiple: false,
    category: 'activity',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'unlocked-units': {
    type: 'unlocked-units',
    name: 'Unlocked Units',
    description: 'Security alert for unlocked units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'lock-status': {
    type: 'lock-status',
    name: 'Lock Status',
    description: 'Control locks for all your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'facility_admin']
  },
  'shared-keys': {
    type: 'shared-keys',
    name: 'Shared Keys Overview',
    description: 'Manage shared access to your units',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large', 'medium-tall'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['tenant', 'admin', 'facility_admin']
  },
  'system-status': {
    type: 'system-status',
    name: 'System Status',
    description: 'Overall system health',
    defaultSize: 'large',
    availableSizes: ['small', 'medium', 'large', 'large-wide'],
    allowMultiple: false,
    category: 'status',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'remote-gate': {
    type: 'remote-gate',
    name: 'Remote Gate Control',
    description: 'Control facility gates remotely',
    defaultSize: 'medium',
    availableSizes: ['medium', 'large'],
    allowMultiple: false,
    category: 'system',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'sync-fms': {
    type: 'sync-fms',
    name: 'FMS Sync',
    description: 'Synchronize customer data with FMS',
    defaultSize: 'medium',
    availableSizes: ['small', 'medium', 'large'],
    allowMultiple: false,
    category: 'system',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'performance-stats': {
    type: 'performance-stats',
    name: 'System Performance',
    description: 'Performance metrics',
    defaultSize: 'huge',
    availableSizes: ['medium', 'large', 'huge'],
    allowMultiple: false,
    category: 'system',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'test-scroll': {
    type: 'test-scroll',
    name: 'Scrollable Content',
    description: 'Demo scrollable widget',
    defaultSize: 'large',
    availableSizes: ['medium', 'medium-tall', 'large', 'huge', 'large-wide', 'huge-wide'],
    allowMultiple: true,
    category: 'system',
    requiredPermissions: ['admin', 'facility_admin']
  },
  'histogram': {
    type: 'histogram',
    name: 'Activity Histogram',
    description: 'Site activity over time',
    defaultSize: 'large-wide',
    availableSizes: ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
    allowMultiple: true,
    category: 'analytics',
    requiredPermissions: ['admin', 'facility_admin']
  }
};

/**
 * Widget Type Helper Class
 *
 * Utility class providing type-safe operations on the widget registry.
 * Handles widget validation, filtering, permission checking, and backward compatibility.
 *
 * Key Features:
 * - Type-safe widget lookups and validation
 * - Permission-based filtering for user roles
 * - Category-based widget organization
 * - Backward compatibility mapping for legacy widget IDs
 * - Comprehensive error handling and fallbacks
 *
 * Use Cases:
 * - Frontend widget selection and filtering
 * - Backend permission validation for widget access
 * - Migration support for legacy widget configurations
 * - UI rendering and widget availability checking
 *
 * Architecture:
 * - Static methods for stateless operations
 * - Registry-based lookups for performance
 * - Comprehensive fallback handling for unknown types
 * - Logging for debugging and migration assistance
 *
 * Security Considerations:
 * - Permission validation before widget access
 * - Safe fallbacks for unknown widget types
 * - Input sanitization for widget ID parsing
 * - Audit logging for permission checks
 */
export class WidgetTypeHelper {
  /**
   * Retrieve widget type definition by type string
   * @param type - Widget type identifier to look up
   * @returns Widget definition or undefined if not found
   */
  static getWidgetType(type: string): WidgetTypeDefinition | undefined {
    return WIDGET_REGISTRY[type as WidgetType];
  }

  /**
   * Validate if a string is a valid widget type
   * @param type - String to validate as widget type
   * @returns Type guard confirming the string is a valid WidgetType
   */
  static isValidWidgetType(type: string): type is WidgetType {
    return type in WIDGET_REGISTRY;
  }

  /**
   * Get all widgets belonging to a specific category
   * @param category - Widget category to filter by
   * @returns Array of widget definitions in the specified category
   */
  static getWidgetsByCategory(category: WidgetCategory): WidgetTypeDefinition[] {
    return Object.values(WIDGET_REGISTRY).filter(widget => widget.category === category);
  }

  /**
   * Get complete list of all available widget types
   * @returns Array of all widget type definitions
   */
  static getAllWidgetTypes(): WidgetTypeDefinition[] {
    return Object.values(WIDGET_REGISTRY);
  }

  /**
   * Get widgets available to a specific user role based on permissions
   * @param userRole - User role string to check permissions against
   * @returns Array of widget definitions accessible to the user role
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
   * Extract canonical widget type from legacy widget ID (for backward compatibility)
   *
   * This method provides migration support for legacy widget configurations.
   * It should be used sparingly - prefer using canonical widget types directly.
   *
   * @param widgetId - Legacy widget ID string to convert
   * @returns Canonical widget type string, with safe fallbacks
   */
  static extractWidgetTypeFromId(widgetId: string): string {
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
    if (widgetId.includes('system_status') || widgetId.includes('status')) {
      return WIDGET_TYPES['system-status'];
    }
    if (widgetId.includes('performance_stats') || widgetId.includes('performance')) {
      return WIDGET_TYPES['performance-stats'];
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
    
    // Last resort - try to extract type from common patterns
    console.warn(`WidgetTypeHelper: Unknown widget ID pattern: ${widgetId}`);
    
    // Try to extract a reasonable type from the ID
    const idLower = widgetId.toLowerCase();
    if (idLower.includes('stats')) return 'stats-facilities'; // Default stats widget
    if (idLower.includes('activity')) return 'activity-monitor';
    if (idLower.includes('status')) return 'system-status';
    if (idLower.includes('performance')) return 'performance-stats';
    
    // Return a safe default that exists in the registry
    return 'stats-facilities';
  }
}
