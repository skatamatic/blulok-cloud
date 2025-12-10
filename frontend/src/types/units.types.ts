export interface Unit {
  id: string;
  unit_number: string;
  unit_type: string;
  facility_id: string;
  device_id?: string;
  status: 'locked' | 'unlocked' | 'maintenance' | 'offline';
  battery_level?: number;
  last_seen?: string;
  is_online: boolean;
  created_at: string;
  updated_at: string;
  
  // Device telemetry data (from joined blulok_devices table)
  lock_status?: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status?: 'online' | 'offline' | 'error' | 'maintenance';
  signal_strength?: number;
  temperature?: number;
  error_code?: string | null;
  error_message?: string | null;
  firmware_version?: string;
  
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
