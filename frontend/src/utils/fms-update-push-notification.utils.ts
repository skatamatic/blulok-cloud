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

export function describeFmsUpdatePushSubjectFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!metadata) return undefined;
  if (typeof metadata.subjectLabel === 'string' && metadata.subjectLabel.trim()) {
    return metadata.subjectLabel.trim();
  }

  const payload =
    metadata.payload && typeof metadata.payload === 'object' && !Array.isArray(metadata.payload)
      ? (metadata.payload as Record<string, unknown>)
      : metadata;

  const firstName = pickString(payload, 'first_name', 'firstName');
  const lastName = pickString(payload, 'last_name', 'lastName');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const email = pickString(payload, 'email');
  const unitId = pickString(payload, 'unit_id', 'unitId', 'unit_number', 'unitNumber');

  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  if (unitId) return `Unit ${unitId}`;
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
    .replace(/\b(\d+) change\(s\) pending review\b/gi, '$1 change(s) need your review');
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

  const facilityName =
    typeof metadata.facilityName === 'string' ? metadata.facilityName.trim() : undefined;
  if (facilityName) {
    rows.push({ label: 'Facility', value: facilityName });
  }

  return rows;
}
