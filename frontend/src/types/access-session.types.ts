/**
 * Access session projection from GET /api/v1/access-sessions
 * (legacy transitional: GET /access-history?view=sessions).
 * Mirrors backend AccessSessionRecord.
 */

export type AccessSessionState =
  | 'pending'
  | 'open'
  | 'closed'
  | 'timed_out'
  | 'denied'
  | 'failed';

export type AccessSessionOrigin = 'cloud_remote' | 'on_site' | 'local' | 'system';

export type AccessSessionKind = 'access' | 'lock_only';

export type AccessSessionOutcome = 'granted' | 'denied' | 'failed';

export type AccessSessionDeviceType = 'blulok' | 'access_control';

export type AccessSessionActorType = 'user' | 'system' | 'device' | 'gateway';

export type AccessHistoryView = 'sessions' | 'raw';

export interface AccessSession {
  id: string;
  kind: string;
  origin: string;
  method: string;
  outcome: string | null;
  state: AccessSessionState;
  device_id: string;
  device_type: AccessSessionDeviceType;
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  actor_type?: string;
  actor_role?: string;
  denial_reason?: string;
  reason?: string;
  attempt_count: number;
  started_at: string;
  opened_at?: string;
  closed_at?: string;
  expires_at?: string;
  settled_at?: string;
  open_duration_sec?: number;
  remote_command_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  device_name?: string;
  device_serial?: string;
}

export type AccessSessionOutcomeTone =
  | 'pending'
  | 'open'
  | 'open_stale'
  | 'open_critical'
  | 'success'
  | 'failed'
  | 'timed_out';

export type AccessSessionOutcomeDisplay = {
  label: string;
  tone: AccessSessionOutcomeTone;
};

export type AccessSessionListResponse = {
  success: boolean;
  sessions: AccessSession[];
  /** Same as sessions when view=sessions (compat). Raw AccessLog[] when view=raw. */
  logs: AccessSession[] | unknown[];
  total: number;
  currently_open?: number;
  limit?: number;
  offset?: number;
  view?: AccessHistoryView;
};

export type AccessSessionDetailResponse = {
  success: boolean;
  session: AccessSession;
  events: unknown[];
  /** Compat alias for session when detail is a session. */
  log?: AccessSession;
};
