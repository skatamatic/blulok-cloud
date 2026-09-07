/** In-memory correlator/activity ring per process (Cloud Run instance-local). */
export const ACCESS_SESSION_TRACE_RING_SIZE = 300;

/** Snapshot list caps (sessions, activity, devices). */
export const ACCESS_SESSION_TRACE_SNAPSHOT_LIMIT = 150;

export const ACCESS_SESSION_TRACE_SUBSCRIPTION = 'access_session_trace';
export const ACCESS_SESSION_TRACE_MESSAGE_TYPE = 'access_session_trace_update';

export const ACCESS_SESSION_TRACE_RULES = [
  'One physical access should become one access_sessions row; activity_logs stay the raw evidence.',
  'Repeat on-site grants (mobile_key/app/keypad/route_pass) coalesce into the existing pending or open session (same method + actor).',
  'Unlock that races a grant insert discards the local open and opens the pending (metadata.unlocked_after_grant_race).',
  'devices/state unlock before grant absorbs a recent local/anonymous open into the grant (metadata.absorbed_local_open).',
  'Pending cloud_remote wins over absorb; gateway grants attach to that pending.',
  'Denials never coalesce. Sweeper times out pending past expires_at.',
  'In-memory pending lock commands are process-local; durable attribution lives on pending cloud_remote sessions.',
] as const;
