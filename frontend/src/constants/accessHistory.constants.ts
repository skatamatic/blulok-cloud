/**
 * Access History vocabulary (labels + filter options).
 * Denial labels must stay in sync with backend DENIAL_REASON_MESSAGES
 * (see accessHistory.constants.test.ts).
 */

export const ACTION_LABELS: Record<string, string> = {
  unlock_attempt: 'Unlock attempt denied',
  lock_attempt: 'Lock attempt failed',
  access_denied: 'Unlock attempt denied',
  access_granted: 'Access granted',
  remote_access_granted: 'Remote Access Granted',
  admin_remote_open: 'Admin remote open',
  keypad_attempt: 'Keypad attempt',
  unlock: 'Unlock',
  lock: 'Lock',
  timeout: 'Timed out',
  manual_override: 'Manual override',
  schedule_violation: 'Schedule violation',
};

export const METHOD_LABELS: Record<string, string> = {
  remote_gateway: 'Cloud',
  admin_remote: 'Cloud',
  local_device: 'Local device',
  automatic: 'Local device',
  app: 'Mobile app',
  mobile_key: 'Mobile key',
  keypad: 'Keypad',
  route_pass: 'Route pass',
  admin_override: 'Admin override',
  system: 'System',
  unknown: 'Unknown',
  card: 'Card',
  physical_key: 'Physical key',
  manual: 'Manual override',
};

/** Same strings as backend `DENIAL_REASON_MESSAGES`. */
export const DENIAL_REASON_LABELS: Record<string, string> = {
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
  system_error: 'System error',
  device_offline: 'Device offline',
  expired_access: 'Expired access',
  maintenance_mode: 'Maintenance mode',
  timeout: 'Timed out waiting for gateway confirmation',
  settlement_mismatch: 'Device did not reach the requested lock state',
};

export type AccessHistoryFilterOption = { key: string; label: string };

/** Filter keys shown in Access History action dropdown (order matters). */
export const ACCESS_HISTORY_ACTION_FILTER_KEYS = [
  'unlock',
  'lock',
  'access_granted',
  'unlock_attempt',
  'lock_attempt',
  'remote_access_granted',
  'manual_override',
  'schedule_violation',
] as const;

/**
 * Method filter keys. `cloud` matches both admin_remote and remote_gateway
 * (same as backend AccessHistoryReadService.methodMatchesFilter).
 */
export const ACCESS_HISTORY_METHOD_FILTER_KEYS = [
  'app',
  'keypad',
  'card',
  'physical_key',
  'manual',
  'cloud',
  'local_device',
  'route_pass',
  'automatic',
  'mobile_key',
] as const;

function titleCaseWords(label: string): string {
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildAccessHistoryActionFilterOptions(): AccessHistoryFilterOption[] {
  return [
    { key: '', label: 'All Actions' },
    ...ACCESS_HISTORY_ACTION_FILTER_KEYS.map((key) => ({
      key,
      label: titleCaseWords(ACTION_LABELS[key] || key.replace(/_/g, ' ')),
    })),
  ];
}

export function buildAccessHistoryMethodFilterOptions(): AccessHistoryFilterOption[] {
  const labels: Record<string, string> = {
    app: 'Mobile App',
    keypad: 'Keypad',
    card: 'Card',
    physical_key: 'Physical Key',
    manual: 'Manual Override',
    cloud: 'Cloud',
    local_device: 'Local Device',
    route_pass: 'Route Pass',
    automatic: 'Local Device (legacy)',
    mobile_key: 'Mobile Key',
  };
  return [
    { key: '', label: 'All Methods' },
    ...ACCESS_HISTORY_METHOD_FILTER_KEYS.map((key) => ({
      key,
      label: labels[key] || METHOD_LABELS[key] || titleCaseWords(key.replace(/_/g, ' ')),
    })),
  ];
}

/** Aligns with backend `methodMatchesFilter` (`cloud` → admin_remote | remote_gateway). */
export function accessHistoryMethodMatchesFilter(method: string, filter: string): boolean {
  if (filter === 'cloud') {
    return method === 'admin_remote' || method === 'remote_gateway';
  }
  const normalizedFilter = filter === 'automatic' ? 'local_device' : filter;
  const normalizedMethod = method === 'automatic' ? 'local_device' : method;
  return normalizedMethod === normalizedFilter;
}
