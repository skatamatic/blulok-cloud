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
};

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

  const unitLabel = meta.unit?.number
    ? `Unit ${meta.unit.number}`
    : log.unit_number
      ? `Unit ${log.unit_number}`
      : null;

  const deviceLabel =
    meta.device?.name ||
    log.device_name ||
    (log.device_serial ? `Lock ${log.device_serial}` : null) ||
    (log.device_type === 'access_control' ? 'Access control device' : null);

  const locationHint = meta.device?.location || log.device_location || null;

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

export type AccessLogDetailItem = {
  label: string;
  value: string;
  href?: string;
};

export function buildAccessLogDetailItems(log: AccessLog, hideFacility: boolean): AccessLogDetailItem[] {
  const meta = getAccessLogMetadata(log);
  const user = getAccessUserDisplay(log);
  const failureDetail = getAccessFailureDetail(log);
  const items: AccessLogDetailItem[] = [
    { label: 'Action', value: formatAccessAction(log.action) },
    { label: 'Method', value: formatAccessMethod(log.method) },
    { label: 'Status', value: getAccessStatusDisplay(log).label },
    { label: 'User', value: user.primary },
  ];

  if (!hideFacility && (meta.facility?.name || log.facility_name)) {
    items.push({
      label: 'Facility',
      value: meta.facility?.name || log.facility_name || '—',
      href: meta.facility?.navigation_url,
    });
  }

  if (meta.unit?.number || log.unit_number) {
    items.push({
      label: 'Unit',
      value: meta.unit?.number ? `Unit ${meta.unit.number}` : log.unit_number || '—',
      href: meta.unit?.navigation_url,
    });
  }

  if (meta.device?.name || log.device_name || log.device_serial) {
    items.push({
      label: 'Device',
      value: meta.device?.name || log.device_name || (log.device_serial ? `Lock ${log.device_serial}` : '—'),
      href: meta.device?.navigation_url,
    });
  }

  if (meta.device?.location || log.device_location) {
    items.push({ label: 'Location', value: meta.device?.location || log.device_location || '—' });
  }

  if (failureDetail) {
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

  items.push({ label: 'Occurred', value: formatDateTime(log.occurred_at) });

  return items;
}
