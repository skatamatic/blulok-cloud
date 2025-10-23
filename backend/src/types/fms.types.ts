/**
 * FMS (Facility Management System) Integration Types
 * 
 * This module defines the types and interfaces for integrating with
 * various third-party Facility Management Systems.
 */

export enum FMSProviderType {
  STOREDGE = 'storedge',
  GENERIC_REST = 'generic_rest', // Generic REST API integration
  SIMULATED = 'simulated', // For testing and demos
}

export enum FMSAuthType {
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
  OAUTH1 = 'oauth1',
  BASIC_AUTH = 'basic_auth',
  BEARER_TOKEN = 'bearer_token',
  CUSTOM = 'custom',
}

export enum FMSSyncStatus {
  IDLE = 'idle',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING_REVIEW = 'pending_review',
}

export enum FMSChangeType {
  TENANT_ADDED = 'tenant_added',
  TENANT_REMOVED = 'tenant_removed',
  TENANT_UPDATED = 'tenant_updated',
  TENANT_UNIT_CHANGED = 'tenant_unit_changed',
  UNIT_ADDED = 'unit_added',
  UNIT_REMOVED = 'unit_removed',
  UNIT_UPDATED = 'unit_updated',
}

export enum FMSChangeAction {
  ADD_ACCESS = 'add_access',
  REMOVE_ACCESS = 'remove_access',
  UPDATE_USER = 'update_user',
  CREATE_USER = 'create_user',
  DEACTIVATE_USER = 'deactivate_user',
  ASSIGN_UNIT = 'assign_unit',
  UNASSIGN_UNIT = 'unassign_unit',
}

export interface FMSAuthConfig {
  type: FMSAuthType;
  credentials: {
    apiKey?: string;
    username?: string;
    password?: string;
    bearerToken?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    tokenEndpoint?: string;
    consumerKey?: string; // OAuth1 consumer key
    consumerSecret?: string; // OAuth1 consumer secret
    [key: string]: any; // Allow custom auth fields
  };
}

export interface FMSProviderConfig {
  providerType: FMSProviderType;
  baseUrl?: string;
  apiVersion?: string;
  auth: FMSAuthConfig;
  features: {
    supportsTenantSync: boolean;
    supportsUnitSync: boolean;
    supportsWebhooks: boolean;
    supportsRealtime: boolean;
  };
  syncSettings: {
    autoAcceptChanges: boolean;
    syncInterval?: number; // Minutes between automatic syncs
    webhookUrl?: string; // Our webhook URL for this facility
    webhookSecret?: string; // Secret for webhook validation
  };
  customSettings?: Record<string, any>; // Provider-specific settings
}

export interface FMSConfiguration {
  id: string;
  facility_id: string;
  provider_type: FMSProviderType;
  is_enabled: boolean;
  config: FMSProviderConfig;
  last_sync_at?: Date;
  last_sync_status?: FMSSyncStatus;
  created_at: Date;
  updated_at: Date;
}

export interface FMSTenant {
  externalId: string; // ID from FMS
  email: string | null; // Can be null for invalid tenants
  firstName: string | null; // Can be null for invalid tenants
  lastName: string | null; // Can be null for invalid tenants
  phone?: string;
  unitIds: string[]; // External unit IDs from FMS
  leaseStartDate?: Date;
  leaseEndDate?: Date;
  status: 'active' | 'inactive' | 'pending';
  customFields?: Record<string, any>;
}

export interface FMSUnit {
  externalId: string; // ID from FMS
  unitNumber: string;
  unitType?: string;
  size?: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  tenantId?: string; // External tenant ID from FMS
  monthlyRate?: number;
  customFields?: Record<string, any>;
}

export interface FMSChange {
  id: string;
  sync_log_id: string;
  change_type: FMSChangeType;
  entity_type: 'tenant' | 'unit';
  external_id: string; // FMS entity ID
  internal_id?: string; // Our entity ID (if exists)
  before_data?: any;
  after_data: any;
  required_actions: FMSChangeAction[];
  impact_summary: string;
  is_reviewed: boolean;
  is_accepted?: boolean;
  applied_at?: Date;
  created_at: Date;
  // Validation fields
  is_valid?: boolean; // Whether this change is valid and can be applied
  validation_errors?: string[]; // List of validation error messages
}

export interface FMSSyncLog {
  id: string;
  facility_id: string;
  fms_config_id: string;
  sync_status: FMSSyncStatus;
  started_at: Date;
  completed_at?: Date;
  triggered_by: 'manual' | 'automatic' | 'webhook';
  triggered_by_user_id?: string;
  changes_detected: number;
  changes_applied: number;
  changes_pending: number;
  changes_rejected: number;
  error_message?: string;
  sync_summary?: {
    tenants_synced: number;
    units_synced: number;
    errors: string[];
    warnings: string[];
  };
  created_at: Date;
  updated_at: Date;
}

export interface FMSSyncResult {
  success: boolean;
  syncLogId: string;
  changesDetected: FMSChange[];
  summary: {
    tenantsAdded: number;
    tenantsRemoved: number;
    tenantsUpdated: number;
    unitsAdded: number;
    unitsRemoved: number;
    unitsUpdated: number;
    errors: string[];
    warnings: string[];
  };
  requiresReview: boolean;
}

export interface FMSChangeApplicationResult {
  success: boolean;
  changesApplied: number;
  changesFailed: number;
  errors: string[];
  accessChanges: {
    usersCreated: string[];
    usersDeactivated: string[];
    accessGranted: Array<{ userId: string; unitId: string }>;
    accessRevoked: Array<{ userId: string; unitId: string }>;
  };
}

/**
 * Webhook payload structure for FMS notifications
 */
export interface FMSWebhookPayload {
  event_type: 'tenant.created' | 'tenant.updated' | 'tenant.deleted' | 
              'unit.created' | 'unit.updated' | 'unit.deleted' |
              'lease.started' | 'lease.ended';
  timestamp: string;
  facility_external_id?: string;
  data: any;
  signature?: string; // For webhook verification
}

/**
 * FMS Provider capabilities
 */
export interface FMSProviderCapabilities {
  supportsTenantSync: boolean;
  supportsUnitSync: boolean;
  supportsWebhooks: boolean;
  supportsRealtime: boolean;
  supportsLeaseManagement: boolean;
  supportsPaymentIntegration: boolean;
  supportsBulkOperations: boolean;
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

