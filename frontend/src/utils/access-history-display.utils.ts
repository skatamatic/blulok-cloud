import { AccessLog } from '@/types/access-history.types';
import {
  ACTION_LABELS,
  DENIAL_REASON_LABELS,
  METHOD_LABELS,
} from '@/constants/accessHistory.constants';
import { formatDateTime } from '@/utils/datetime.utils';
import { formatBluLokUserFacingLabel } from '@/utils/blulokDeviceDisplay.utils';
import { readDisplayName } from '@/utils/deviceMetadataForm.utils';

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
    device_settings?: Record<string, unknown> | null;
    navigation_url: string;
  };
  description?: string;
  failure_summary?: string;
  tenant_unlock_override?: {
    reason?: string;
    reason_label?: string;
    notes?: string | null;
  };
  correlated_remote?: boolean;
  occupied_unit_override?: boolean;
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string | undefined | null): boolean {
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

function normalizeDeviceLabelCandidate(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed || looksLikeUuid(trimmed)) return null;

  if (trimmed.startsWith('Lock ')) {
    const rest = trimmed.slice(5).trim();
    if (looksLikeUuid(rest)) return null;
  }

  return trimmed;
}

function resolveBluLokAccessHistoryDeviceLabel(
  log: AccessLog,
  meta: AccessLogPresentationMetadata,
): string {
  // Prefer displayName via page-title path without trusting stale meta.device.name (may be Lock #).
  const displayName = readDisplayName(meta.device?.device_settings);
  if (displayName && !looksLikeUuid(displayName)) return displayName;

  return formatBluLokUserFacingLabel({
    device_serial: log.device_serial,
    device_settings: meta.device?.device_settings,
    unit_number: log.unit_number ?? meta.unit?.number ?? null,
    unit_id: log.unit_id ?? meta.unit?.id ?? null,
  });
}

/** Human-readable access point / device label (never a cloud row UUID). */
export function formatAccessHistoryDeviceLabel(
  log: AccessLog,
  meta: AccessLogPresentationMetadata,
): string | null {
  if (log.device_type === 'blulok') {
    const blulokLabel = resolveBluLokAccessHistoryDeviceLabel(log, meta);
    if (blulokLabel) return blulokLabel;
  }

  const candidates = [
    meta.device?.name,
    log.device_name,
    log.device_type === 'access_control' ? log.device_location : null,
    meta.device?.location,
    log.device_serial && log.device_type !== 'blulok' ? log.device_serial : null,
    log.device_type === 'access_control' ? 'Access point' : null,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDeviceLabelCandidate(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function getAccessLogMetadata(log: AccessLog): AccessLogPresentationMetadata {
  return (log.metadata || {}) as AccessLogPresentationMetadata;
}

/** User details route used by access history deep links. */
function getAccessLogUserDetailsPath(userId: string): string {
  return `/users/${userId}/details`;
}

export function isCorrelatedRemoteUnlock(log: Pick<AccessLog, 'action' | 'method' | 'metadata'>): boolean {
  const meta = (log.metadata || {}) as AccessLogPresentationMetadata;
  if (log.action !== 'unlock') return false;
  if (meta.correlated_remote === true) return true;
  return Boolean(meta.initiated_by?.id || meta.initiated_by?.name) && log.method === 'local_device';
}

export function isManualLockEvent(log: Pick<AccessLog, 'action' | 'method'>): boolean {
  return log.action === 'lock' && (log.method === 'local_device' || log.method === 'automatic');
}

export function hasOccupiedUnlockOverride(log: Pick<AccessLog, 'metadata'>): boolean {
  const meta = (log.metadata || {}) as AccessLogPresentationMetadata;
  if (meta.occupied_unit_override === true) return true;
  return Boolean(meta.tenant_unlock_override?.reason || meta.tenant_unlock_override?.reason_label);
}

/** Human reason label for occupied-unit override, when present. */
export function getOccupiedUnlockOverrideReasonLabel(
  log: Pick<AccessLog, 'metadata'>,
): string | null {
  if (!hasOccupiedUnlockOverride(log)) return null;
  const meta = (log.metadata || {}) as AccessLogPresentationMetadata;
  const override = meta.tenant_unlock_override;
  const reasonLabel =
    typeof override?.reason_label === 'string' ? override.reason_label.trim() : '';
  if (reasonLabel) return reasonLabel;

  const reasonCode = typeof override?.reason === 'string' ? override.reason.trim() : '';
  if (!reasonCode) return null;
  return reasonCode
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compact subtitle for Access History rows, e.g. "Occupied unit · Emergency". */
export function formatOccupiedUnlockOverrideSubtitle(
  log: Pick<AccessLog, 'metadata'>,
): string | null {
  if (!hasOccupiedUnlockOverride(log)) return null;
  const reason = getOccupiedUnlockOverrideReasonLabel(log);
  return reason ? `Occupied unit · ${reason}` : 'Occupied unit override';
}

/** Human action label. Pass a full log for context-aware labels (Manually Locked, Unlocked at site). */
export function formatAccessAction(actionOrLog: string | AccessLog): string {
  if (typeof actionOrLog !== 'string') {
    const log = actionOrLog;
    if (log.action === 'remote_access_granted') return 'Remote Access Granted';
    if (isCorrelatedRemoteUnlock(log)) return 'Unlocked at site';
    if (isManualLockEvent(log)) return 'Manually Locked';
    if (ACTION_LABELS[log.action]) return ACTION_LABELS[log.action];
    return log.action.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  if (ACTION_LABELS[actionOrLog]) {
    return ACTION_LABELS[actionOrLog];
  }
  return actionOrLog.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAccessMethod(methodOrLog: string | AccessLog): string {
  if (typeof methodOrLog !== 'string') {
    if (isManualLockEvent(methodOrLog)) return 'Manual lock';
    if (isCorrelatedRemoteUnlock(methodOrLog)) return 'At site';
    return formatAccessMethod(methodOrLog.method);
  }
  if (METHOD_LABELS[methodOrLog]) {
    return METHOD_LABELS[methodOrLog];
  }
  return methodOrLog.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Tailwind text color class for the action column. */
export function getAccessActionToneClass(log: Pick<AccessLog, 'action' | 'method' | 'success' | 'metadata'>): string {
  if (!log.success) return 'text-red-600 dark:text-red-400';
  if (hasOccupiedUnlockOverride(log)) return 'text-amber-800 dark:text-amber-300';
  if (isManualLockEvent(log) || log.action === 'lock' || log.action === 'door_close' || log.action === 'gate_close') {
    return 'text-red-600 dark:text-red-400';
  }
  if (
    log.action === 'unlock'
    || log.action === 'access_granted'
    || log.action === 'remote_access_granted'
    || log.action === 'door_open'
    || log.action === 'gate_open'
  ) {
    return 'text-green-600 dark:text-green-400';
  }
  if (log.action === 'elevator_call' || log.action === 'elevator_access') {
    return 'text-purple-600 dark:text-purple-400';
  }
  if (log.action === 'manual_override' || log.action === 'admin_remote_open') {
    return 'text-orange-600 dark:text-orange-400';
  }
  if (log.action === 'timeout' || log.action === 'schedule_violation') {
    return 'text-amber-700 dark:text-amber-300';
  }
  return 'text-gray-600 dark:text-gray-400';
}

/** Matching tinted tile behind the action icon (avoids monochrome gray wells). */
export function getAccessActionIconTileClass(
  log: Pick<AccessLog, 'action' | 'method' | 'success' | 'metadata'>,
): string {
  if (!log.success) return 'bg-red-100 dark:bg-red-900/40';
  if (hasOccupiedUnlockOverride(log)) return 'bg-amber-100 dark:bg-amber-900/45';
  if (isManualLockEvent(log) || log.action === 'lock' || log.action === 'door_close' || log.action === 'gate_close') {
    return 'bg-red-100 dark:bg-red-900/40';
  }
  if (
    log.action === 'unlock'
    || log.action === 'access_granted'
    || log.action === 'remote_access_granted'
    || log.action === 'door_open'
    || log.action === 'gate_open'
  ) {
    return 'bg-green-100 dark:bg-green-900/40';
  }
  if (log.action === 'elevator_call' || log.action === 'elevator_access') {
    return 'bg-purple-100 dark:bg-purple-900/40';
  }
  if (log.action === 'manual_override' || log.action === 'admin_remote_open') {
    return 'bg-orange-100 dark:bg-orange-900/40';
  }
  if (log.action === 'timeout' || log.action === 'schedule_violation') {
    return 'bg-amber-100 dark:bg-amber-900/40';
  }
  return 'bg-gray-100 dark:bg-gray-700';
}

const METHOD_TONE_CLASSES: Record<string, string> = {
  app: 'text-blue-600 dark:text-blue-400',
  mobile_app: 'text-blue-600 dark:text-blue-400',
  mobile_key: 'text-blue-600 dark:text-blue-400',
  remote: 'text-blue-600 dark:text-blue-400',
  remote_gateway: 'text-[#147FD4] dark:text-sky-400',
  admin_remote: 'text-[#147FD4] dark:text-sky-400',
  keypad: 'text-slate-600 dark:text-slate-300',
  card: 'text-purple-600 dark:text-purple-400',
  rfid: 'text-purple-600 dark:text-purple-400',
  physical_key: 'text-slate-600 dark:text-slate-300',
  manual: 'text-orange-600 dark:text-orange-400',
  automatic: 'text-green-600 dark:text-green-400',
  local_device: 'text-green-600 dark:text-green-400',
  route_pass: 'text-indigo-600 dark:text-indigo-400',
  system: 'text-slate-600 dark:text-slate-300',
  unknown: 'text-slate-500 dark:text-slate-400',
  admin_override: 'text-red-600 dark:text-red-400',
  emergency: 'text-red-600 dark:text-red-400',
  scheduled: 'text-amber-700 dark:text-amber-300',
  biometric: 'text-teal-600 dark:text-teal-400',
  pin: 'text-slate-600 dark:text-slate-300',
};

/** Tailwind text color for the method column icon. */
export function getAccessMethodToneClass(
  log: Pick<AccessLog, 'action' | 'method' | 'success' | 'metadata'>,
): string {
  if (isManualLockEvent(log)) return 'text-red-600 dark:text-red-400';
  if (isCorrelatedRemoteUnlock(log)) return 'text-green-600 dark:text-green-400';
  return METHOD_TONE_CLASSES[log.method] || 'text-slate-500 dark:text-slate-400';
}

function formatDenialReason(reason: string): string {
  return DENIAL_REASON_LABELS[reason] || formatAccessAction(reason);
}

function trimDisplayText(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimPersonDisplayText(value: string | undefined | null): string | null {
  const trimmed = trimDisplayText(value);
  if (!trimmed || looksLikeUuid(trimmed) || /^user$/i.test(trimmed)) return null;
  if (/^(gateway|system)$/i.test(trimmed)) return null;
  // Gateway placeholder names — cloud resolves the real user from user_id.
  if (/^unknown(\s|-)?user$/i.test(trimmed) || /^unknown$/i.test(trimmed)) return null;
  if (/^unknown[-_\s]/i.test(trimmed)) return null;
  return trimmed;
}

function resolveAccessLogUserLabel(
  log: AccessLog,
  meta: AccessLogPresentationMetadata = getAccessLogMetadata(log),
): string | null {
  const linkedUserId = meta.initiated_by?.id || meta.user?.id || log.user_id || null;
  if (!linkedUserId) return null;

  const nameCandidates = [
    meta.initiated_by?.name,
    meta.user?.name,
    meta.actor?.type === 'user' ? meta.actor?.name : null,
    log.user_id === linkedUserId ? log.user_name : null,
    log.user_id === linkedUserId ? log.primary_tenant_name : null,
  ];

  for (const candidate of nameCandidates) {
    const label = trimPersonDisplayText(candidate);
    if (label) return label;
  }

  const emailCandidates = [
    meta.user?.email,
    log.user_id === linkedUserId ? log.user_email : null,
    log.user_id === linkedUserId ? log.primary_tenant_email : null,
  ];

  for (const candidate of emailCandidates) {
    const label = trimDisplayText(candidate);
    if (label) return label;
  }

  return null;
}

export type AccessLogUserLink = {
  id: string;
  href: string;
  label: string;
};

/** Linked user navigation target for access history rows, when one exists. */
export function getAccessLogUserLink(log: AccessLog): AccessLogUserLink | null {
  const meta = getAccessLogMetadata(log);
  const linkedUserId = meta.initiated_by?.id || meta.user?.id || log.user_id || null;
  if (!linkedUserId) return null;

  const label = resolveAccessLogUserLabel(log, meta);
  if (!label) return null;

  if (meta.user?.id && meta.user.navigation_url) {
    return {
      id: meta.user.id,
      href: meta.user.navigation_url,
      label,
    };
  }

  if (meta.initiated_by?.id && meta.initiated_by.navigation_url) {
    return {
      id: meta.initiated_by.id,
      href: meta.initiated_by.navigation_url,
      label,
    };
  }

  const userId = meta.user?.id || meta.initiated_by?.id || log.user_id;
  if (!userId) return null;

  return {
    id: userId,
    href: getAccessLogUserDetailsPath(userId),
    label,
  };
}

export function isNonUserAccessActor(log: AccessLog): boolean {
  const meta = getAccessLogMetadata(log);
  if (meta.initiated_by?.id || meta.initiated_by?.name || meta.user?.id || meta.user?.name || log.user_id) {
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
  const linkedLabel = resolveAccessLogUserLabel(log, meta);

  if (linkedLabel) {
    return {
      primary: linkedLabel,
      secondary: meta.user?.email || log.user_email || log.primary_tenant_email || null,
    };
  }

  // Correlated remote unlock keeps the initiator even though method is local_device.
  if (meta.initiated_by?.name && (isCorrelatedRemoteUnlock(log) || log.action === 'remote_access_granted')) {
    return {
      primary: trimPersonDisplayText(meta.initiated_by.name) || '—',
      secondary: meta.user?.email || log.user_email || null,
    };
  }

  if (log.method === 'local_device' || log.method === 'automatic' || log.method === 'keypad') {
    return { primary: '—', secondary: null };
  }

  if (isNonUserAccessActor(log)) {
    return { primary: '—', secondary: null };
  }

  const primary = meta.actor?.name || log.user_name;
  return {
    primary: trimPersonDisplayText(primary) || '—',
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
): { primary: string; secondary: string | null } {
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
    };
  }

  const facilityName = meta.facility?.name || log.facility_name || 'Unknown facility';
  return {
    primary: facilityName,
    secondary: unitLabel || deviceLabel,
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

export function partitionAccessLogDetailItems(items: AccessLogDetailItem[]): {
  failure: AccessLogDetailItem | null;
  notes: AccessLogDetailItem | null;
  fields: AccessLogDetailItem[];
} {
  const failure = items.find((item) => item.label === 'Failure reason') ?? null;
  const notes = items.find((item) => item.label === 'Notes') ?? null;
  const fields = items.filter(
    (item) => item.label !== 'Failure reason' && item.label !== 'Notes',
  );
  return { failure, notes, fields };
}

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

  const userLink = getAccessLogUserLink(log);

  if (!omitRow) {
    items.push(
      { label: 'Action', value: formatAccessAction(log) },
      { label: 'Method', value: formatAccessMethod(log) },
      { label: 'Status', value: getAccessStatusDisplay(log).label },
      {
        label: 'User',
        value: user.primary,
        href: userLink?.href,
        navigationId: userLink?.id,
        navigationTarget: userLink ? 'user' : undefined,
      },
    );
  } else if (userLink && user.primary !== '—') {
    items.push({
      label: 'User',
      value: userLink.label,
      href: userLink.href,
      navigationId: userLink.id,
      navigationTarget: 'user',
    });
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
    const includeLocation = omitRow
      ? Boolean(locationValue && locationValue !== '—')
      : location.secondary !== locationValue;
    if (includeLocation) {
      items.push({ label: 'Location', value: locationValue });
    }
  }

  if (failureDetail) {
    items.push({ label: 'Failure reason', value: failureDetail });
  }

  const unlockOverride = meta.tenant_unlock_override;
  if (unlockOverride && typeof unlockOverride === 'object') {
    const reasonLabel =
      (typeof unlockOverride.reason_label === 'string' && unlockOverride.reason_label.trim())
      || (typeof unlockOverride.reason === 'string' && unlockOverride.reason.trim())
      || '';
    if (reasonLabel) {
      items.push({ label: 'Unlock reason', value: reasonLabel });
    }
    const overrideNotes =
      typeof unlockOverride.notes === 'string' ? unlockOverride.notes.trim() : '';
    if (overrideNotes) {
      items.push({ label: 'Notes', value: overrideNotes });
    }
  }

  if (meta.description) {
    const notes = meta.description.trim();
    const alreadyHasNotes = items.some((item) => item.label === 'Notes');
    if (!alreadyHasNotes && (!failureDetail || notes !== failureDetail.trim())) {
      items.push({ label: 'Notes', value: meta.description });
    }
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
