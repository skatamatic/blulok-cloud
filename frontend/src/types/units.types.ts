export interface Unit {
  id: string;
  unit_number: string;
  unit_type: string;
  facility_id: string;
  facility_lock_command_timeout_sec?: number | null;
  device_id?: string;
  status: 'locked' | 'unlocked' | 'maintenance' | 'offline';
  battery_level?: number;
  last_seen?: string;
  is_online: boolean;
  created_at: string;
  updated_at: string;
  
  // Device telemetry data (from joined blulok_devices table)
  lock_status?: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  blulok_device?: {
    id: string;
    lock_status: string;
  };
  device_status?: 'online' | 'offline' | 'low_battery' | 'error' | 'maintenance';
  signal_strength?: number;
  temperature?: number;
  error_code?: string | null;
  error_message?: string | null;
  firmware_version?: string;

  /** Occupancy — returned by GET /units (and detail) for tenant unlock override. */
  tenant_name?: string | null;
  primary_tenant?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  shared_tenants?: Array<{ id: string }> | null;
  
  // Joined data
  facility?: {
    id: string;
    name: string;
    location: string;
  };
  device?: {
    id: string;
    device_name: string;
    device_type: string;
    status: string;
  };
}

export interface UnitsResponse {
  units: Unit[];
  total: number;
  limit: number;
  offset: number;
}

export interface UnitFilters {
  facility_id?: string;
  unit_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
