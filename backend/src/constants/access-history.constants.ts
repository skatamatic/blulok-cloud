import type { ActivityType } from '@/models/activity-log.model';

/** Max facilities included in activity histogram aggregation (all-facilities mode). */
export const MAX_HISTOGRAM_FACILITIES = 50;

/** Max rows returned from access history export. */
export const MAX_ACCESS_HISTORY_EXPORT = 5000;

/** Activity types shown in Activity Monitor, histogram, and live activity feeds. */
export const DASHBOARD_ACTIVITY_TYPES: ActivityType[] = [
  'access_attempt',
  'lock',
  'unlock',
  'locking',
  'unlocking',
];

/** Terminal activity types included in access history list/export (excludes in-flight states). */
export const ACCESS_HISTORY_ACTIVITY_TYPES: ActivityType[] = [
  'access_attempt',
  'lock',
  'unlock',
];

/** Activity types aggregated for the dashboard histogram (unlocks + access attempts only). */
export const HISTOGRAM_ACTIVITY_TYPES: ActivityType[] = [
  'access_attempt',
  'unlock',
];

/** Read-layer method values surfaced in access history API. */
export const ACCESS_HISTORY_METHODS = [
  'app',
  'mobile_key',
  'keypad',
  'admin_remote',
  'remote_gateway',
  'local_device',
  'route_pass',
  'system',
  'unknown',
] as const;

export type AccessHistoryMethod = (typeof ACCESS_HISTORY_METHODS)[number];

/** Human-readable denial reason labels for access history presentation. */
export const DENIAL_REASON_MESSAGES: Record<string, string> = {
  out_of_schedule: 'Out of schedule window',
  route_pass_expired: 'Route pass expired',
  route_pass_invalid_signature: 'Invalid route pass signature',
  route_pass_wrong_lock: 'Route pass not valid for this lock',
  internal_error: 'Internal processing error',
  denylist_blocked: 'Actor or device on denylist',
  insufficient_permissions: 'Insufficient permissions',
  invalid_credential: 'Invalid credential',
  unknown_error: 'Unknown error',
  other: 'Access denied',
  // Legacy access_logs values
  system_error: 'System error',
  device_offline: 'Device offline',
  expired_access: 'Expired access',
  maintenance_mode: 'Maintenance mode',
  timeout: 'Timed out waiting for gateway confirmation',
  settlement_mismatch: 'Device did not reach the requested lock state',
};

export function denialReasonToLabel(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (DENIAL_REASON_MESSAGES[reason]) {
    return DENIAL_REASON_MESSAGES[reason];
  }
  return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildAccessFailureSummary(
  denialReason: string | undefined,
  resultMessage: string | undefined,
): string | undefined {
  const denialLabel = denialReasonToLabel(denialReason);
  if (denialLabel && resultMessage && resultMessage !== denialLabel) {
    return `${denialLabel} — ${resultMessage}`;
  }
  return denialLabel || resultMessage;
}

const GATEWAY_SYNC_DESCRIPTION = /^Device was (locked|unlocked|locking|unlocking) by Gateway$/i;

export function isGatewaySyncActivityDescription(description: string | undefined): boolean {
  if (!description) return false;
  return GATEWAY_SYNC_DESCRIPTION.test(description.trim());
}
