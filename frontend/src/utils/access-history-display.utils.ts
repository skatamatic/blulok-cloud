import { AccessLog } from '@/types/access-history.types';
import { formatDateTime } from '@/utils/datetime.utils';

export type AccessLogPresentationMetadata = {
  user?: { id: string; name: string; email?: string; navigation_url: string };
  initiated_by?: { id: string; name: string; navigation_url?: string; role?: string };
  actor?: { type: string; name: string };
  facility?: { id: string; name: string; navigation_url: string };
  unit?: { id: string; number: string; type?: string; navigation_url: string };
  device?: {
    id: string;
    name: string;
    type?: string;
    location?: string;
    serial?: string;
    navigation_url: string;
  };
  description?: string;
  failure_summary?: string;
};

const ACTION_LABELS: Record<string, string> = {
  unlock_attempt: 'Unlock attempt denied',
  lock_attempt: 'Lock attempt failed',
  access_denied: 'Unlock attempt denied',
  access_granted: 'Access granted',
  admin_remote_open: 'Admin remote open',
  keypad_attempt: 'Keypad attempt',
  unlock: 'Unlock',
  lock: 'Lock',
  timeout: 'Timed out',
};

const METHOD_LABELS: Record<string, string> = {
  remote_gateway: 'Remote via gateway',
  admin_remote: 'Remote (admin)',
  local_device: 'Local device',
  automatic: 'Local device',
  app: 'Mobile app',
  mobile_key: 'Mobile key',
  keypad: 'Keypad',
  route_pass: 'Route pass',
  admin_override: 'Admin override',
  system: 'System',
  unknown: 'Unknown',
};

const DENIAL_REASON_LABELS: Record<string, string> = {
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
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_LIKE.test(value.trim());
}

export function formatAccessHistoryUnitLabel(
  log: AccessLog,
  meta: AccessLogPresentationMetadata,
): string | null {
  const raw =
    (meta.unit?.number && !looksLikeUuid(meta.unit.number) ? meta.unit.number : null)
    || (log.unit_number && !looksLikeUuid(log.unit_number) ? log.unit_number : null);
  return raw ? `Unit ${raw}` : null;
}

/** Human-readable access point / device label (never a cloud row UUID). */
export function formatAccessHistoryDeviceLabel(
  log: AccessLog,
  meta: AccessLogPresentationMetadata,
): string | null {
  const candidates = [
    meta.device?.name,
    log.device_name,
    log.device_type === 'access_control' ? log.device_location : null,
    meta.device?.location,
    log.device_serial ? (log.device_type === 'access_control' ? log.device_serial : `Lock ${log.device_serial}`) : null,
    log.device_type === 'access_control' ? 'Access point' : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !looksLikeUuid(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

export function getAccessLogMetadata(log: AccessLog): AccessLogPresentationMetadata {
  return (log.metadata || {}) as AccessLogPresentationMetadata;
}

export function formatAccessAction(action: string): string {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }
  return action.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAccessMethod(method: string): string {
  if (METHOD_LABELS[method]) {
    return METHOD_LABELS[method];
  }
  return method.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDenialReason(reason: string): string {
  return DENIAL_REASON_LABELS[reason] || formatAccessAction(reason);
}

export function isNonUserAccessActor(log: AccessLog): boolean {
  const meta = getAccessLogMetadata(log);
  if (meta.initiated_by?.name || meta.user?.name || log.user_id) {
    return false;
  }
  const actorType = meta.actor?.type || log.actor_type;
  if (actorType === 'user') return false;
  if (actorType && actorType !== 'user') return true;
  if (!log.user_id && (log.user_name === 'Gateway' || log.user_name === 'System')) return true;
  return false;
}

export function getAccessUserDisplay(log: AccessLog): { primary: string; secondary: string | null } {
  const meta = getAccessLogMetadata(log);

  if (meta.initiated_by?.name) {
    return {
      primary: meta.initiated_by.name,
      secondary: meta.user?.email || log.user_email || null,
    };
  }

  if (meta.user?.name) {
    return {
      primary: meta.user.name,
      secondary: meta.user.email || log.user_email || null,
    };
  }

  const primary = meta.actor?.name || log.user_name;
  if (primary && !isNonUserAccessActor(log)) {
    return {
      primary,
      secondary: log.user_email || null,
    };
  }

  if (log.method === 'local_device' || log.method === 'automatic' || log.method === 'keypad') {
    return { primary: '—', secondary: null };
  }

  if (isNonUserAccessActor(log)) {
    return { primary: '—', secondary: null };
  }

  return {
    primary: primary || '—',
    secondary: log.user_email || null,
  };
}

export function getAccessFailureDetail(log: AccessLog): string | null {
  const meta = getAccessLogMetadata(log);
  if (meta.failure_summary) {
    return meta.failure_summary;
  }
  if (log.denial_reason) {
    return formatDenialReason(log.denial_reason);
  }
  if (log.reason) {
    return log.reason;
  }
  return null;
}

export function getAccessStatusDisplay(log: AccessLog): {
  label: string;
  tone: 'success' | 'failed' | 'pending';
} {
  const status = (log as AccessLog & { status?: string }).status;
  if (status === 'pending') {
    return { label: 'In progress', tone: 'pending' };
  }
  if (log.success) {
    return { label: 'Success', tone: 'success' };
  }
  return { label: 'Failed', tone: 'failed' };
}

export function getAccessLocationDisplay(
  log: AccessLog,
  options: { hideFacility: boolean },
): { primary: string; secondary: string | null; showFacilityLink: boolean } {
  const meta = getAccessLogMetadata(log);

  const unitLabel = formatAccessHistoryUnitLabel(log, meta);
  const deviceLabel = formatAccessHistoryDeviceLabel(log, meta);
  const locationHint =
    (log.device_type === 'access_control' ? log.device_location || meta.device?.location : null)
    || meta.device?.location
    || log.device_location
    || null;

  if (options.hideFacility) {
    return {
      primary: unitLabel || deviceLabel || '—',
      secondary: unitLabel ? (locationHint || deviceLabel) : locationHint,
      showFacilityLink: false,
    };
  }

  const facilityName = meta.facility?.name || log.facility_name || 'Unknown facility';
  return {
    primary: facilityName,
    secondary: unitLabel || deviceLabel,
    showFacilityLink: !!meta.facility?.id,
  };
}

export type AccessLogNavigationTarget = 'user' | 'facility' | 'unit' | 'device';

export type AccessLogDetailItem = {
  label: string;
  value: string;
  href?: string;
  navigationId?: string;
  navigationTarget?: AccessLogNavigationTarget;
};

export function buildAccessLogDetailItems(
  log: AccessLog,
  hideFacility: boolean,
  options?: { omitRowSummaryFields?: boolean },
): AccessLogDetailItem[] {
  const meta = getAccessLogMetadata(log);
  const user = getAccessUserDisplay(log);
  const failureDetail = getAccessFailureDetail(log);
  const location = getAccessLocationDisplay(log, { hideFacility });
  const unitLabel = formatAccessHistoryUnitLabel(log, meta);
  const deviceLabel = formatAccessHistoryDeviceLabel(log, meta);
  const omitRow = options?.omitRowSummaryFields ?? false;

  const items: AccessLogDetailItem[] = [];

  if (!omitRow) {
    items.push(
      { label: 'Action', value: formatAccessAction(log.action) },
      { label: 'Method', value: formatAccessMethod(log.method) },
      { label: 'Status', value: getAccessStatusDisplay(log).label },
      { label: 'User', value: user.primary },
    );
  }

  if (!hideFacility && (meta.facility?.name || log.facility_name)) {
    items.push({
      label: 'Facility',
      value: meta.facility?.name || log.facility_name || '—',
      href: meta.facility?.navigation_url,
      navigationId: meta.facility?.id,
      navigationTarget: 'facility',
    });
  }

  if (unitLabel && (!omitRow || location.primary !== unitLabel)) {
    items.push({
      label: 'Unit',
      value: unitLabel,
      href: meta.unit?.navigation_url,
      navigationId: meta.unit?.id,
      navigationTarget: 'unit',
    });
  }

  if (deviceLabel && (!omitRow || location.primary !== deviceLabel)) {
    items.push({
      label: log.device_type === 'access_control' ? 'Access point' : 'Device',
      value: deviceLabel,
      href: meta.device?.navigation_url,
      navigationId: meta.device?.id,
      navigationTarget: 'device',
    });
  }

  if (meta.device?.location || log.device_location) {
    const locationValue = meta.device?.location || log.device_location || '—';
    if (!omitRow || location.secondary !== locationValue) {
      items.push({ label: 'Location', value: locationValue });
    }
  }

  if (failureDetail && (!omitRow || log.success)) {
    items.push({ label: 'Failure reason', value: failureDetail });
  }

  if (meta.description) {
    items.push({ label: 'Notes', value: meta.description });
  }

  if (log.ip_address) {
    items.push({ label: 'IP address', value: log.ip_address });
  }

  if (log.credential_type) {
    items.push({ label: 'Credential', value: formatAccessAction(log.credential_type) });
  }

  if (!omitRow) {
    items.push({ label: 'Occurred', value: formatDateTime(log.occurred_at) });
  }

  return items;
}
