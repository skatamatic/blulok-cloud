import { AccessLog } from '@/types/access-history.types';

export type AccessLogPresentationMetadata = {
  user?: { id: string; name: string; email?: string; navigation_url: string };
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
};

export function getAccessLogMetadata(log: AccessLog): AccessLogPresentationMetadata {
  return (log.metadata || {}) as AccessLogPresentationMetadata;
}

export function formatAccessAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAccessMethod(method: string): string {
  return method.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isNonUserAccessActor(log: AccessLog): boolean {
  const meta = getAccessLogMetadata(log);
  const actorType = meta.actor?.type || log.actor_type;
  if (actorType && actorType !== 'user') return true;
  if (!log.user_id && (log.user_name === 'Gateway' || log.user_name === 'System')) return true;
  return false;
}

export function getAccessUserDisplay(log: AccessLog): { primary: string; secondary: string | null } {
  const meta = getAccessLogMetadata(log);
  const primary = meta.user?.name || meta.actor?.name || log.user_name || 'System';

  if (isNonUserAccessActor(log)) {
    const actorType = meta.actor?.type || log.actor_type;
    if (actorType === 'gateway' || primary === 'Gateway') {
      return { primary: 'Gateway', secondary: 'Facility gateway sync' };
    }
    if (actorType === 'system' || primary === 'System') {
      return { primary: 'System', secondary: null };
    }
    return { primary, secondary: null };
  }

  return {
    primary,
    secondary: meta.user?.email || log.user_email || null,
  };
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
    (log.device_type === 'access_control' ? 'Access control device' : 'Device');

  const locationHint = meta.device?.location || log.device_location || null;

  if (options.hideFacility) {
    return {
      primary: unitLabel || deviceLabel,
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
};

export function buildAccessLogDetailItems(log: AccessLog, hideFacility: boolean): AccessLogDetailItem[] {
  const meta = getAccessLogMetadata(log);
  const user = getAccessUserDisplay(log);
  const location = getAccessLocationDisplay(log, { hideFacility });
  const items: AccessLogDetailItem[] = [
    { label: 'Action', value: formatAccessAction(log.action) },
    { label: 'Method', value: formatAccessMethod(log.method) },
    { label: 'Status', value: log.success ? 'Success' : 'Failed' },
    { label: 'Actor', value: user.primary },
  ];

  if (user.secondary) {
    items.push({ label: 'Actor detail', value: user.secondary });
  }

  if (!hideFacility && (meta.facility?.name || log.facility_name)) {
    items.push({ label: 'Facility', value: meta.facility?.name || log.facility_name || '—' });
  }

  if (meta.unit?.number || log.unit_number) {
    items.push({ label: 'Unit', value: meta.unit?.number || log.unit_number || '—' });
  }

  if (meta.device?.name || log.device_name || log.device_serial) {
    items.push({
      label: 'Device',
      value: meta.device?.name || log.device_name || (log.device_serial ? `Lock ${log.device_serial}` : '—'),
    });
  }

  if (meta.device?.location || log.device_location) {
    items.push({ label: 'Location', value: meta.device?.location || log.device_location || '—' });
  }

  if (log.denial_reason) {
    items.push({ label: 'Denial reason', value: formatAccessAction(log.denial_reason) });
  }

  if (log.reason) {
    items.push({ label: 'Result message', value: log.reason });
  }

  if (meta.description) {
    items.push({ label: 'Description', value: meta.description });
  }

  if (log.ip_address) {
    items.push({ label: 'IP address', value: log.ip_address });
  }

  if (log.credential_type) {
    items.push({ label: 'Credential', value: formatAccessAction(log.credential_type) });
  }

  items.push({ label: 'Occurred', value: new Date(log.occurred_at).toLocaleString() });

  if (location.secondary && !items.some((item) => item.label === 'Device' || item.label === 'Unit')) {
    items.push({ label: 'Access point', value: location.secondary });
  }

  return items;
}
