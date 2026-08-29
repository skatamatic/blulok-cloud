/** User-facing labels for FMS update push notifications (mirrors backend copy). */
const FMS_UPDATE_EVENT_LABELS: Record<string, string> = {
  'tenant.created': 'New tenant',
  'tenant.updated': 'Tenant updated',
  'ledger.moved-in': 'Tenant move-in',
  'ledger.moved-out': 'Tenant move-out',
  'lead.moved-in': 'Lead move-in',
  'unit.created': 'Unit created',
  'unit.deleted': 'Unit removed',
  'unit.overlock-applied': 'Overlock applied',
  'unit.overlock-removed': 'Overlock removed',
};

export type FmsUpdatePushDetailRow = {
  label: string;
  value: string;
};

function formatEventLabel(eventType: string): string {
  return eventType.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getFmsUpdateEventLabel(eventType: string | undefined): string {
  if (!eventType) return 'FMS update';
  return FMS_UPDATE_EVENT_LABELS[eventType] ?? formatEventLabel(eventType);
}

const OPAQUE_FMS_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOpaqueFmsId(value: string | undefined): boolean {
  if (!value) return false;
  return OPAQUE_FMS_ID_RE.test(value.trim());
}

function pickString(
  data: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickFriendly(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = pickString(data, ...keys);
  if (!value || isOpaqueFmsId(value)) return undefined;
  return value;
}

function formatUnitSubject(unitLabel: string): string {
  const trimmed = unitLabel.trim();
  if (!trimmed || isOpaqueFmsId(trimmed)) return '';
  return /^unit\s+/i.test(trimmed) ? trimmed : `Unit ${trimmed}`;
}

function isOpaqueSubjectLabel(label: string): boolean {
  return isOpaqueFmsId(label.replace(/^unit\s+/i, '').trim());
}

export function describeFmsUpdatePushSubjectFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!metadata) return undefined;
  if (typeof metadata.subjectLabel === 'string' && metadata.subjectLabel.trim()) {
    const labeled = metadata.subjectLabel.trim();
    if (!isOpaqueSubjectLabel(labeled)) {
      return labeled;
    }
  }

  const payload =
    metadata.payload && typeof metadata.payload === 'object' && !Array.isArray(metadata.payload)
      ? (metadata.payload as Record<string, unknown>)
      : metadata;

  const firstName = pickString(payload, 'first_name', 'firstName');
  const lastName = pickString(payload, 'last_name', 'lastName');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const email = pickFriendly(payload, 'email');
  const unitRaw =
    pickFriendly(payload, 'unit_number', 'unitNumber') || pickFriendly(payload, 'unit_id', 'unitId');
  const unit = unitRaw ? formatUnitSubject(unitRaw) : '';

  if (name && unit) return `${name} · ${unit}`;
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  if (unit) return unit;
  return undefined;
}

export function describeFmsUpdatePushStatusFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata) return 'Update received';

  if (typeof metadata.statusLabel === 'string' && metadata.statusLabel.trim()) {
    return metadata.statusLabel.trim();
  }

  const changesDetected = Number(metadata.changesDetected ?? 0);
  const changesApplied = Number(metadata.changesApplied ?? 0);
  const autoApplied = metadata.autoApplied === true;
  const requiresReview = metadata.requiresReview === true;

  if (changesDetected === 0) return 'No action needed';
  if (autoApplied) return 'Applied automatically';
  if (metadata.autoApplyBlocked === true) {
    if (changesApplied > 0) {
      return `${changesApplied} applied · automatic sync stopped`;
    }
    return 'Automatic sync did not apply';
  }
  if (requiresReview) {
    if (changesApplied > 0) {
      const pending = Math.max(0, changesDetected - changesApplied);
      return `${changesApplied} applied · ${pending} need review`;
    }
    return 'Needs your review';
  }
  return 'Update received';
}

export function normalizeFmsUpdatePushTitle(title: string): string {
  if (/fms webhook received/i.test(title)) {
    return 'FMS Update Push';
  }
  return title;
}

/** Legacy notifications may embed technical copy in the message — leave as-is when already friendly. */
export function normalizeFmsUpdatePushMessage(message: string): string {
  return message
    .replace(/\bwebhook\b/gi, 'FMS update')
    .replace(/\b(\d+) change\(s\) pending review\b/gi, '$1 change(s) need your review')
    .replace(/\s*\(Unit\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)\s*$/i, '');
}

export function getFmsUpdatePushDetailRows(
  metadata: Record<string, unknown> | null | undefined,
): FmsUpdatePushDetailRow[] {
  if (!metadata) return [];

  const rows: FmsUpdatePushDetailRow[] = [];
  const eventType = typeof metadata.eventType === 'string' ? metadata.eventType : undefined;

  rows.push({
    label: 'Update type',
    value: getFmsUpdateEventLabel(eventType),
  });

  const subject = describeFmsUpdatePushSubjectFromMetadata(metadata);
  if (subject) {
    rows.push({ label: 'Subject', value: subject });
  }

  const changesDetected = Number(metadata.changesDetected ?? 0);
  if (changesDetected > 0) {
    const applied = Number(metadata.changesApplied ?? 0);
    rows.push({
      label: 'Changes',
      value:
        applied > 0
          ? `${changesDetected} detected · ${applied} applied`
          : `${changesDetected} detected`,
    });
  }

  rows.push({
    label: 'Status',
    value: describeFmsUpdatePushStatusFromMetadata(metadata),
  });

  appendFmsReviewProblemRows(rows, metadata);

  const facilityName =
    typeof metadata.facilityName === 'string' ? metadata.facilityName.trim() : undefined;
  if (facilityName) {
    rows.push({ label: 'Facility', value: facilityName });
  }

  return rows;
}

function firstProblemSummary(metadata: Record<string, unknown>): string | undefined {
  const summaries = metadata.problemSummaries;
  if (!Array.isArray(summaries)) return undefined;
  const first = summaries.find((item) => typeof item === 'string' && item.trim());
  return typeof first === 'string' ? first.trim() : undefined;
}

function appendFmsReviewProblemRows(
  rows: FmsUpdatePushDetailRow[],
  metadata: Record<string, unknown>,
): void {
  const problem = firstProblemSummary(metadata);
  if (problem) {
    rows.push({ label: 'Problem', value: problem });
  }
  if (metadata.autoApplyBlocked === true || problem) {
    rows.push({
      label: 'Next step',
      value:
        'Open Review changes to inspect the blocked items. Fix the shared email/phone in your FMS, or remap the user so each BluLok account maps to one FMS tenant.',
    });
  } else if (metadata.requiresReview === true) {
    rows.push({
      label: 'Next step',
      value: 'Open Review changes to accept or dismiss these updates.',
    });
  }
}

export function getFmsSyncReviewDetailRows(
  metadata: Record<string, unknown> | null | undefined,
): FmsUpdatePushDetailRow[] {
  if (!metadata) return [];

  const rows: FmsUpdatePushDetailRow[] = [];
  rows.push({
    label: 'Status',
    value:
      typeof metadata.statusLabel === 'string' && metadata.statusLabel.trim()
        ? metadata.statusLabel.trim()
        : metadata.autoApplyBlocked === true
          ? 'Automatic sync did not apply'
          : 'Needs your review',
  });

  const pending = Number(metadata.pendingCount ?? 0);
  if (pending > 0) {
    rows.push({
      label: 'Changes',
      value: `${pending} need review`,
    });
  }

  appendFmsReviewProblemRows(rows, metadata);
  return rows;
}
