export interface AccessLog {
  id: string;
  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  access_control_device_id?: string;
  gateway_id?: string;
  user_id?: string;
  primary_tenant_id?: string;
  credential_id?: string;
  credential_type?: 'physical_key' | 'mobile_app' | 'card' | 'keypad';
  action: 'unlock' | 'lock' | 'access_granted' | 'access_denied' | 'manual_override' | 
          'door_open' | 'door_close' | 'gate_open' | 'gate_close' | 'elevator_call' |
          'system_error' | 'timeout' | 'invalid_credential' | 'schedule_violation';
  method: 'app' | 'keypad' | 'card' | 'manual' | 'automatic' | 'physical_key' |
          'mobile_key' | 'admin_override' | 'emergency' | 'scheduled';
  success: boolean;
  denial_reason?: 'invalid_credential' | 'out_of_schedule' | 'system_error' | 'device_offline' |
                  'insufficient_permissions' | 'expired_access' | 'maintenance_mode' | 'other';
  reason?: string;
  location_context?: string;
  session_id?: string;
  device_response?: Record<string, any>;
  latitude?: number;
  longitude?: number;
  duration_seconds?: number;
  ip_address?: string;
  metadata?: Record<string, any>;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  
  // Joined data
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  primary_tenant_name?: string;
  primary_tenant_email?: string;
  device_name?: string;
  device_location?: string;
  gateway_name?: string;
}

export interface AccessHistoryFilters {
  user_id?: string;
  facility_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface AccessHistoryResponse {
  logs: AccessLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface KeySharing {
  id: string;
  unit_id: string;
  primary_tenant_id: string;
  shared_with_user_id: string;
  access_level: 'read' | 'write' | 'admin';
  expires_at?: string;
  granted_by: string;
  notes?: string;
  access_restrictions?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  
  // Joined data
  unit?: {
    id: string;
    unit_number: string;
    unit_type: string;
  };
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  shared_with_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  granted_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface KeySharingFilters {
  unit_id?: string;
  primary_tenant_id?: string;
  shared_with_user_id?: string;
  access_level?: string;
  is_active?: boolean;
  expires_before?: string;
  limit?: number;
  offset?: number;
}

export interface KeySharingResponse {
  sharings: KeySharing[];
  total: number;
  limit: number;
  offset: number;
}
