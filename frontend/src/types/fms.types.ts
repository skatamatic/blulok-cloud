/**
 * FMS Types - Frontend
 * 
 * Type definitions for FMS integration (matches backend contracts)
 */

export enum FMSProviderType {
  STOREDGE = 'storedge',
  GENERIC_REST = 'generic_rest',
  SIMULATED = 'simulated',
}

export enum FMSAuthType {
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
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
    [key: string]: any;
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
    syncInterval?: number;
    webhookUrl?: string;
    webhookSecret?: string;
  };
  customSettings?: Record<string, any>;
}

export interface FMSConfiguration {
  id: string;
  facility_id: string;
  provider_type: FMSProviderType;
  is_enabled: boolean;
  config: FMSProviderConfig;
  last_sync_at?: string;
  last_sync_status?: FMSSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface FMSChange {
  id: string;
  sync_log_id: string;
  change_type: FMSChangeType;
  entity_type: 'tenant' | 'unit';
  external_id: string;
  internal_id?: string;
  before_data?: any;
  after_data: any;
  required_actions: FMSChangeAction[];
  impact_summary: string;
  is_reviewed: boolean;
  is_accepted?: boolean;
  applied_at?: string;
  created_at: string;
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

export interface FMSSyncLog {
  id: string;
  facility_id: string;
  fms_config_id: string;
  sync_status: FMSSyncStatus;
  started_at: string;
  completed_at?: string;
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
  created_at: string;
  updated_at: string;
}

// API Response types
export interface FMSConfigResponse {
  success: boolean;
  config?: FMSConfiguration;
  message?: string;
}

export interface FMSSyncResponse {
  success: boolean;
  result?: FMSSyncResult;
  message?: string;
}

export interface FMSChangesResponse {
  success: boolean;
  changes?: FMSChange[];
  total?: number;
  message?: string;
}

export interface FMSTestConnectionResponse {
  success: boolean;
  connected?: boolean;
  message?: string;
  error?: string;
}

// Provider metadata for UI
export interface FMSProviderMetadata {
  type: FMSProviderType;
  name: string;
  description: string;
  authType: FMSAuthType;
  requiresBaseUrl: boolean;
  supportsWebhooks: boolean;
  isDevOnly?: boolean; // For simulated provider
  configFields: {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'number' | 'boolean';
    required: boolean;
    placeholder?: string;
    helpText?: string;
  }[];
}
