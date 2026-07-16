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
  /** Seconds to wait for remote lock/unlock gateway confirmation (default 10). */
  lock_command_timeout_sec?: number;
  metadata?: Record<string, unknown>;
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
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccessControlDevice {
  id: string;
  gateway_id: string;
  /** Present on list/detail responses (from gateway’s facility). */
  facility_id?: string;
  facility_name?: string | null;
  gateway_name?: string | null;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string;
  device_serial: string;
  relay_channel: number;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  /** Last-reported status from gateway telemetry (before reachability coercion). */
  reported_status?: 'online' | 'offline' | 'error' | 'maintenance';
  /** Set when effective status was coerced offline due to gateway reachability. */
  status_unreachable_reason?: string | null;
  is_locked: boolean;
  /** When true, cloud may send remote lock (CLOSE). Default false — unlock-only from cloud. */
  supports_remote_lock?: boolean;
  /** When true, Remote Gate widget may send timed OPEN with open_until (unix UTC seconds). */
  supports_widget_timed_open?: boolean;
  /** Whether the hardware reports authoritative open/closed state. Defaults to true. */
  has_lock_feedback?: boolean;
  /** Cloud-owned open window in seconds when hardware has no lock-state feedback. */
  no_feedback_open_timeout_sec?: number;
  /** Current cloud-owned open-window deadline. */
  no_feedback_unlock_until?: string | null;
  last_activity?: string;
  last_seen?: string;
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  access_methods?: AccessMethod[];
  created_at: string;
  updated_at: string;
}

/** Admin POST /api/v1/devices/access-control */
export interface CreateAccessControlDevicePayload {
  gateway_id: string;
  device_serial: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description: string;
  relay_channel: number;
  access_methods?: AccessMethod[];
  supports_remote_lock?: boolean;
  supports_widget_timed_open?: boolean;
  has_lock_feedback?: boolean;
  no_feedback_open_timeout_sec?: number;
  device_settings?: Record<string, unknown>;
}

/** Admin PUT /api/v1/devices/access-control/:id */
export interface UpdateAccessControlDevicePayload {
  name?: string;
  location_description?: string;
  device_serial?: string;
  relay_channel?: number;
  status?: AccessControlDevice['status'];
  is_locked?: boolean;
  supports_remote_lock?: boolean;
  supports_widget_timed_open?: boolean;
  has_lock_feedback?: boolean;
  no_feedback_open_timeout_sec?: number;
  access_methods?: AccessMethod[];
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateBluLokDeviceMetadataPayload {
  device_serial?: string;
  serial?: string;
  firmware_version?: string;
  supports_remote_lock?: boolean;
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateAccessControlDeviceMetadataPayload {
  name?: string;
  location_description?: string;
  device_serial?: string;
  relay_channel?: number;
  device_type?: 'gate' | 'elevator' | 'door';
  supports_remote_lock?: boolean;
  supports_widget_timed_open?: boolean;
  has_lock_feedback?: boolean;
  no_feedback_open_timeout_sec?: number;
  access_methods?: AccessMethod[];
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DeviceMetadataSideEffects {
  identityChanged: boolean;
  accessCodesPushed: boolean;
  previousIdentity?: {
    device_serial?: string;
    relay_channel?: number;
  };
}

export type AccessMethod = 'app' | 'keypad' | 'fob';

export interface DeviceGroup {
  id: string;
  facility_id: string;
  /** @deprecated Legacy discriminator — unified access groups no longer branch on this in UI or entitlement logic. */
  group_type: 'zone' | 'access_code';
  is_default: boolean;
  access_code_current_code?: string | null;
  access_code_current_valid_from?: string | null;
  access_code_current_valid_until?: string | null;
  name: string;
  description?: string | null;
  settings?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
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
  access_id: string;
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
  access_id: string;
  relay_channel: number;
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
  /** When true, cloud may send remote lock (CLOSE). Default false — unlock-only from cloud. */
  supports_remote_lock?: boolean;
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
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  facility_lock_command_timeout_sec?: number | null;
  unit_number: string;
  unit_type?: string;
  status: 'available' | 'occupied' | 'overlocked' | 'maintenance' | 'reserved';
  is_overlocked?: boolean;
  description?: string;
  features?: string[];
  metadata?: Record<string, unknown>;
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
    serial?: string;
    device_settings?: Record<string, unknown>;
    /** Remote toggle is only valid for locked/unlocked; transitional or error states are read-only. */
    lock_status: string;
    /** When true, cloud may send remote lock. Default false — unlock-only from cloud. */
    supports_remote_lock?: boolean;
    device_status: string;
    battery_level?: number;
  };
}

export interface DeviceHierarchy {
  facility: Facility;
  /** Assigned gateway metadata for device tree / modals — not used for live connectivity badges (see `useFacilityGatewayLiveStatus`). */
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
  metadata?: Record<string, unknown>;
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
  device_scope?: 'operational' | 'network_infra' | 'all';
  status?: string;
  search?: string;
  sortBy?:
    | 'name'
    | 'unit_number'
    | 'device_type'
    | 'device_kind'
    | 'status'
    | 'facility_name'
    | 'gateway_name'
    | 'last_activity'
    | 'last_seen'
    | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  /** Backend returns only id + device_category (ordered like the full list). */
  projection?: 'id';
}

export interface NetworkInfraDevice {
  id: string;
  device_category: 'network_infra';
  device_kind: 'gateway' | 'bridge' | 'friend_node';
  name: string;
  device_serial: string;
  status: string;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  facility_id?: string | null;
  facility_name?: string | null;
  gateway_id: string;
  gateway_name?: string | null;
  last_seen?: string | null;
  deletable: boolean;
}

export interface UnitFilters {
  facility_id?: string;
  search?: string;
  status?: string;
  unit_type?: string;
  tenant_id?: string;
  lock_status?: 'locked' | 'unlocked' | 'all' | 'unknown';
  sortBy?:
    | 'unit_number'
    | 'unit_type'
    | 'status'
    | 'created_at'
    | 'facility_name'
    | 'tenant_last_name'
    | 'lock_status'
    | 'battery_level';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
