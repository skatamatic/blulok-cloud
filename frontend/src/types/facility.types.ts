export interface Facility {
  id: string;
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  branding_image?: string; // Base64 encoded image
  image_mime_type?: string;
  contact_email?: string;
  contact_phone?: string;
  status: 'active' | 'inactive' | 'maintenance';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  stats?: FacilityStats;
  /** BluDesign 3D facility model ID if linked */
  bluDesignFacilityId?: string;
}

export interface FacilityStats {
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  devicesOnline: number;
  devicesTotal: number;
}

export interface Gateway {
  id: string;
  facility_id: string;
  name: string;
  model?: string;
  firmware_version?: string;
  ip_address?: string;
  mac_address?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_seen?: string;
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AccessControlDevice {
  id: string;
  gateway_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string;
  relay_channel: number;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  is_locked: boolean;
  last_activity?: string;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
  access_methods?: AccessMethod[];
  created_at: string;
  updated_at: string;
}

export type AccessMethod = 'app' | 'keypad' | 'fob';

export interface DeviceGroup {
  id: string;
  facility_id: string;
  group_type: 'zone' | 'access_code';
  is_global_shared: boolean;
  access_code_current_code?: string | null;
  access_code_current_valid_from?: string | null;
  access_code_current_valid_until?: string | null;
  name: string;
  description?: string | null;
  settings?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccessCodeConfig {
  id?: string;
  facility_id: string;
  is_enabled: boolean;
  digit_count: number;
  rotation_interval_hours: number;
  rotation_hour: number;
  rotation_minute: number;
  created_at?: string;
  updated_at?: string;
}

export interface AccessCodeGroupConfig {
  is_enabled: boolean;
  digit_count: number;
  rotation_interval_hours: number;
  rotation_hour: number;
  rotation_minute: number;
}

export interface AccessCode {
  id: string;
  facility_id: string;
  scope_type: 'device_group' | 'device';
  scope_id?: string | null;
  schedule_id?: string | null;
  schedule_name?: string | null;
  code: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  generated_by: 'system' | 'admin';
  set_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EffectiveAccessCode {
  device_id: string;
  device_name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string | null;
  relay_channel: number;
  code: string;
  valid_from?: string;
  valid_until: string;
  schedule_id?: string | null;
  schedule_name?: string | null;
  schedule_time_windows?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
  source_scope_type: 'device_group' | 'device';
  source_scope_id: string | null;
  source_scope_name: string;
}

export interface UserAccessCode {
  device_id: string;
  device_name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string | null;
  code: string;
  valid_until: string;
  schedule_id?: string | null;
  schedule_name?: string | null;
  schedule_time_windows?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
}

export interface BluLokDevice {
  id: string;
  gateway_id: string;
  unit_id: string;
  device_serial: string;
  /** Gateway-provided serial number (optional, separate from device_serial) */
  serial?: string;
  firmware_version?: string;
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
  /** Wireless signal strength in dBm (e.g., -70 dBm) */
  signal_strength?: number;
  /** Device temperature reading in Celsius */
  temperature?: number;
  /** Standardized error code for error states */
  error_code?: string | null;
  /** Human-readable error description */
  error_message?: string | null;
  last_activity?: string;
  last_seen?: string;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Context fields
  unit_number: string;
  unit_type?: string;
  facility_name: string;
  gateway_name: string;
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface Unit {
  id: string;
  facility_id: string;
  unit_number: string;
  unit_type?: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  description?: string;
  features?: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  shared_tenants?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    access_type: string;
    access_granted_at: string;
  }>;
  blulok_device?: {
    id: string;
    device_serial: string;
    lock_status: string;
    device_status: string;
    battery_level?: number;
  };
}

export interface DeviceHierarchy {
  facility: Facility;
  gateway: Gateway | null;
  accessControlDevices: AccessControlDevice[];
  blulokDevices: BluLokDevice[];
}

export interface CreateFacilityData {
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  branding_image?: string; // Base64 encoded image
  image_mime_type?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  metadata?: Record<string, any>;
}

export interface FacilityFilters {
  search?: string;
  status?: string;
  sortBy?: 'name' | 'created_at' | 'status';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  user_id?: string;
}

export interface DeviceFilters {
  facility_id?: string;
  gateway_id?: string;
  device_type?: 'access_control' | 'blulok' | 'all';
  status?: string;
  search?: string;
  sortBy?: 'name' | 'device_type' | 'status' | 'last_activity' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UnitFilters {
  facility_id?: string;
  search?: string;
  status?: string;
  unit_type?: string;
  tenant_id?: string;
  lock_status?: 'locked' | 'unlocked' | 'all' | 'unknown';
  sortBy?: 'unit_number' | 'unit_type' | 'status' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
