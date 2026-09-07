export type AccessSessionTraceKind =
  | 'correlator_decision'
  | 'raw_access_event'
  | 'lock_unlock_event'
  | 'session_upsert';

export interface AccessSessionTraceEvent {
  id: string;
  kind: AccessSessionTraceKind;
  hook?: string;
  decision?: string;
  at: string;
  facility_id?: string;
  gateway_id?: string;
  device_id?: string;
  unit_id?: string;
  user_id?: string;
  session_id?: string;
  activity_id?: string;
  payload: Record<string, unknown>;
}

export interface AccessSessionTraceLookupDevice {
  id: string;
  device_type: 'blulok' | 'access_control';
  serial?: string | null;
  name?: string | null;
  unit_id?: string | null;
  unit_number?: string | null;
  lock_status?: string | null;
  device_status?: string | null;
  gateway_id?: string | null;
}

export interface AccessSessionTraceLookupUnit {
  id: string;
  unit_number?: string | null;
}

export interface AccessSessionTraceLookupUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface AccessSessionTracePendingAttribution {
  source: 'memory' | 'durable_session';
  device_id: string;
  command_id: string;
  requested_status: 'locked' | 'unlocked';
  facility_id: string;
  gateway_id?: string | null;
  unit_id?: string | null;
  session_id?: string;
  initiator?: {
    userId: string;
    userName: string;
    role: string;
  };
}

export interface AccessSessionTraceRow {
  id: string;
  state?: string;
  origin?: string;
  method?: string;
  outcome?: string | null;
  device_id?: string;
  unit_id?: string | null;
  unit_number?: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_user_email?: string | null;
  started_at?: string;
  opened_at?: string | null;
  closed_at?: string | null;
  expires_at?: string | null;
  attempt_count?: number;
  remote_command_id?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface AccessSessionTraceSnapshot {
  captured_at: string;
  process: {
    pid: number;
    hostname: string | null;
    note: string;
  };
  gateway: {
    id: string;
    name?: string | null;
    facility_id: string | null;
    status?: string | null;
  };
  filters: {
    facility_id: string;
    gateway_id?: string;
    device_id?: string;
    unit_id?: string;
    user_id?: string;
  };
  rules: string[];
  live_sessions: AccessSessionTraceRow[];
  recent_sessions: AccessSessionTraceRow[];
  raw_events: AccessSessionTraceRow[];
  pending_attributions: AccessSessionTracePendingAttribution[];
  lock_states: AccessSessionTraceLookupDevice[];
  correlator_decisions: AccessSessionTraceEvent[];
  lookups: {
    devices: Record<string, AccessSessionTraceLookupDevice>;
    units: Record<string, AccessSessionTraceLookupUnit>;
    users: Record<string, AccessSessionTraceLookupUser>;
  };
  debug: {
    live_session_count: number;
    recent_session_count: number;
    raw_event_count: number;
    pending_memory_count: number;
    pending_durable_count: number;
    correlator_ring_count: number;
    sessions_sharing_device: Array<{
      device_id: string;
      session_ids: string[];
      states: string[];
      started_at: Array<string | null>;
    }>;
  };
}

export interface AccessSessionTraceResponse {
  success: boolean;
  snapshot: AccessSessionTraceSnapshot;
  message?: string;
}

export interface AccessSessionTraceFilterState {
  user_id: string;
  unit_id: string;
  /** Local `YYYY-MM-DDTHH:mm[:ss]` after bound; empty = open-ended. */
  time_after: string;
  /** Local `YYYY-MM-DDTHH:mm[:ss]` before bound; empty = open-ended. */
  time_before: string;
}
