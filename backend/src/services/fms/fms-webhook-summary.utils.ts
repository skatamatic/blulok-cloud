import { FMSWebhookPayload } from '@/types/fms.types';

export type FmsWebhookSummary = {
  summary: Record<string, unknown>;
  summaryText: string;
};

function pickString(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function formatEventLabel(eventType: string): string {
  return eventType.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Operator-facing labels for FMS update push notifications. */
export const FMS_UPDATE_EVENT_LABELS: Record<string, string> = {
  'tenant.created': 'New tenant',
  'tenant.updated': 'Tenant updated',
  'ledger.moved-in': 'Tenant move-in',
  'ledger.moved-out': 'Tenant move-out',
  'lead.moved-in': 'Lead move-in',
  'lead.created': 'Lead created',
  'lead.cancelled': 'Lead cancelled',
  'unit.created': 'Unit created',
  'unit.deleted': 'Unit removed',
  'unit.overlock-applied': 'Overlock applied',
  'unit.overlock-removed': 'Overlock removed',
};

export function getFmsUpdateEventLabel(eventType: string): string {
  return FMS_UPDATE_EVENT_LABELS[eventType] ?? formatEventLabel(eventType);
}

export function describeFmsUpdatePushSubject(data: Record<string, unknown>): string | undefined {
  const firstName = pickString(data, 'first_name', 'firstName');
  const lastName = pickString(data, 'last_name', 'lastName');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const email = pickString(data, 'email');
  const unitId = pickString(data, 'unit_id', 'unitId', 'unit_number', 'unitNumber');

  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  if (unitId) return `Unit ${unitId}`;
  return undefined;
}

export function describeFmsUpdatePushStatus(options: {
  changesDetected: number;
  changesApplied?: number;
  autoApplied: boolean;
  requiresReview: boolean;
}): string {
  if (options.changesDetected === 0) {
    return 'No action needed';
  }
  if (options.autoApplied) {
    return 'Applied automatically';
  }
  if (options.requiresReview) {
    const applied = options.changesApplied ?? 0;
    if (applied > 0) {
      const pending = Math.max(0, options.changesDetected - applied);
      return `${applied} applied · ${pending} need review`;
    }
    return 'Needs your review';
  }
  return 'Update received';
}

/** User-facing notification copy for inbound FMS update pushes. */
export function buildFmsUpdatePushNotification(options: {
  facilityName: string;
  eventType: string;
  payloadData: Record<string, unknown>;
  changesDetected: number;
  changesApplied: number;
  autoApplied: boolean;
  requiresReview: boolean;
}): {
  title: string;
  message: string;
  eventLabel: string;
  subjectLabel?: string;
  statusLabel: string;
} {
  const eventLabel = getFmsUpdateEventLabel(options.eventType);
  const subjectLabel = describeFmsUpdatePushSubject(options.payloadData);
  const statusLabel = describeFmsUpdatePushStatus(options);

  let message: string;
  if (options.changesDetected === 0) {
    message = `${options.facilityName} received an FMS update. No changes were needed in BluLok.`;
  } else if (options.autoApplied) {
    message = `${options.facilityName} received a ${eventLabel.toLowerCase()} update from your property management system. Changes were applied automatically.`;
  } else if (options.requiresReview) {
    const applied = options.changesApplied;
    if (applied > 0) {
      const pending = Math.max(0, options.changesDetected - applied);
      message = `${options.facilityName} received a ${eventLabel.toLowerCase()} update. ${applied} change${applied === 1 ? '' : 's'} applied; ${pending} still need${pending === 1 ? 's' : ''} your review.`;
    } else {
      const count = options.changesDetected;
      message = `${options.facilityName} received a ${eventLabel.toLowerCase()} update. ${count} change${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your review before they take effect.`;
    }
  } else {
    message = `${options.facilityName} received a ${eventLabel.toLowerCase()} update from your property management system.`;
  }

  if (subjectLabel) {
    message = `${message} (${subjectLabel})`;
  }

  return {
    title: 'FMS Update Push',
    message,
    eventLabel,
    subjectLabel,
    statusLabel,
  };
}

/** Build a compact, human-readable summary of an inbound FMS webhook payload. */
export function summarizeFmsWebhookPayload(payload: FMSWebhookPayload): FmsWebhookSummary {
  const data = payload.data ?? {};
  const summary: Record<string, unknown> = {
    eventType: payload.event_type,
    externalEventId: payload.externalEventId,
    timestamp: payload.timestamp,
    facilityExternalId: payload.facility_external_id,
    body: data,
  };

  const detailParts: string[] = [formatEventLabel(payload.event_type)];

  const tenantId = pickString(data, 'tenant_id');
  const unitId = pickString(data, 'unit_id');
  const email = pickString(data, 'email');
  const firstName = pickString(data, 'first_name', 'firstName');
  const lastName = pickString(data, 'last_name', 'lastName');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();

  if (name) detailParts.push(name);
  if (email) detailParts.push(email);
  if (tenantId) detailParts.push(`tenant ${tenantId}`);
  if (unitId) detailParts.push(`unit ${unitId}`);

  return {
    summary,
    summaryText: detailParts.join(' · '),
  };
}

export function describeFmsWebhookOutcome(options: {
  changesDetected: number;
  changesApplied?: number;
  autoApplied: boolean;
  requiresReview: boolean;
}): string {
  if (options.changesDetected === 0) {
    return 'No changes detected.';
  }
  if (options.autoApplied) {
    return `${options.changesDetected} change(s) auto-applied.`;
  }
  if (options.requiresReview) {
    const applied = options.changesApplied ?? 0;
    if (applied > 0) {
      const needsReview = Math.max(0, options.changesDetected - applied);
      return `${applied} auto-applied, ${needsReview} need review.`;
    }
    return `${options.changesDetected} change(s) pending review.`;
  }
  return `${options.changesDetected} change(s) detected.`;
}
