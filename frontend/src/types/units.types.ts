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
