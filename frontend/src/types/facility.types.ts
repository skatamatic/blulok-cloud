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
  created_at: string;
  updated_at: string;
}

export interface BluLokDevice {
  id: string;
  gateway_id: string;
  unit_id: string;
  device_serial: string;
  firmware_version?: string;
  lock_status: 'locked' | 'unlocked' | 'error' | 'maintenance';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
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
