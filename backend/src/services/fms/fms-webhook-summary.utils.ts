import { FMSWebhookPayload } from '@/types/fms.types';
import { buildFmsPendingReviewNotification } from '@/services/fms/fms-review-notification.utils';

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

const OPAQUE_FMS_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOpaqueFmsId(value: string | undefined | null): boolean {
  if (!value) return false;
  return OPAQUE_FMS_ID_RE.test(value.trim());
}

export type FmsWebhookDisplayLabels = {
  tenantLabel?: string;
  unitLabel?: string;
};

function pickFriendly(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = pickString(data, ...keys);
  if (!value || isOpaqueFmsId(value)) return undefined;
  return value;
}

export function formatFmsUnitSubject(unitLabel: string): string {
  const trimmed = unitLabel.trim();
  if (!trimmed || isOpaqueFmsId(trimmed)) return '';
  return /^unit\s+/i.test(trimmed) ? trimmed : `Unit ${trimmed}`;
}

export function labelsFromFmsChangePayloads(
  rows: Array<{ after_data?: unknown; before_data?: unknown }>,
): FmsWebhookDisplayLabels {
  let tenantLabel: string | undefined;
  let unitLabel: string | undefined;

  for (const row of rows) {
    const payload =
      row.after_data && typeof row.after_data === 'object' && !Array.isArray(row.after_data)
        ? (row.after_data as Record<string, unknown>)
        : row.before_data && typeof row.before_data === 'object' && !Array.isArray(row.before_data)
          ? (row.before_data as Record<string, unknown>)
          : {};

    const unitNumber = pickFriendly(payload, 'unitNumber', 'unit_number');
    if (unitNumber) unitLabel = unitNumber;

    const firstName = pickString(payload, 'firstName', 'first_name');
    const lastName = pickString(payload, 'lastName', 'last_name');
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    const email = pickFriendly(payload, 'email');
    if (name) tenantLabel = name;
    else if (email) tenantLabel = email;
  }

  return { tenantLabel, unitLabel };
}

export function describeFmsUpdatePushSubject(
  data: Record<string, unknown>,
  display?: FmsWebhookDisplayLabels,
): string | undefined {
  const firstName = pickString(data, 'first_name', 'firstName');
  const lastName = pickString(data, 'last_name', 'lastName');
  const nameFromPayload = [firstName, lastName].filter(Boolean).join(' ').trim();
  const name = display?.tenantLabel?.trim() || nameFromPayload;
  const email = pickFriendly(data, 'email');
  const unitRaw =
    display?.unitLabel?.trim() ||
    pickFriendly(data, 'unit_number', 'unitNumber') ||
    pickFriendly(data, 'unit_id', 'unitId');
  const unit = unitRaw ? formatFmsUnitSubject(unitRaw) : '';

  if (name && unit) return `${name} · ${unit}`;
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  if (unit) return unit;
  return undefined;
}

export function describeFmsUpdatePushStatus(options: {
  changesDetected: number;
  changesApplied?: number;
  autoApplied: boolean;
  requiresReview: boolean;
  autoApplyAttempted?: boolean;
  problemSummaries?: string[];
}): string {
  if (options.changesDetected === 0) {
    return 'No action needed';
  }
  if (options.autoApplied) {
    return 'Applied automatically';
  }
  if (options.requiresReview) {
    return buildFmsPendingReviewNotification({
      facilityName: '',
      pendingCount: Math.max(0, options.changesDetected - (options.changesApplied ?? 0)),
      changesDetected: options.changesDetected,
      changesApplied: options.changesApplied,
      autoApplyAttempted: options.autoApplyAttempted === true,
      problemSummaries: options.problemSummaries,
      source: 'webhook',
    }).statusLabel;
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
  autoApplyAttempted?: boolean;
  problemSummaries?: string[];
  display?: FmsWebhookDisplayLabels;
}): {
  title: string;
  message: string;
  eventLabel: string;
  subjectLabel?: string;
  statusLabel: string;
  autoApplyBlocked?: boolean;
} {
  const eventLabel = getFmsUpdateEventLabel(options.eventType);
  const subjectLabel = describeFmsUpdatePushSubject(options.payloadData, options.display);

  let message: string;
  let statusLabel = describeFmsUpdatePushStatus(options);
  let autoApplyBlocked = false;

  if (options.changesDetected === 0) {
    message = `${options.facilityName} received an FMS update. No changes were needed in BluLok.`;
  } else if (options.autoApplied) {
    message = `${options.facilityName} received a ${eventLabel.toLowerCase()} update from your property management system. Changes were applied automatically.`;
  } else if (options.requiresReview) {
    const review = buildFmsPendingReviewNotification({
      facilityName: options.facilityName,
      pendingCount: Math.max(0, options.changesDetected - options.changesApplied),
      changesDetected: options.changesDetected,
      changesApplied: options.changesApplied,
      autoApplyAttempted: options.autoApplyAttempted === true,
      problemSummaries: options.problemSummaries,
      source: 'webhook',
      eventLabel,
    });
    message = review.message;
    statusLabel = review.statusLabel;
    autoApplyBlocked = review.autoApplyBlocked;
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
    autoApplyBlocked,
  };
}

/** Build a compact, human-readable summary of an inbound FMS webhook payload. */
export function summarizeFmsWebhookPayload(
  payload: FMSWebhookPayload,
  display?: FmsWebhookDisplayLabels,
): FmsWebhookSummary {
  const data = payload.data ?? {};
  const summary: Record<string, unknown> = {
    eventType: payload.event_type,
    externalEventId: payload.externalEventId,
    timestamp: payload.timestamp,
    facilityExternalId: payload.facility_external_id,
    body: data,
  };

  const detailParts: string[] = [formatEventLabel(payload.event_type)];

  const email = pickFriendly(data, 'email');
  const firstName = pickString(data, 'first_name', 'firstName');
  const lastName = pickString(data, 'last_name', 'lastName');
  const name = display?.tenantLabel?.trim() || [firstName, lastName].filter(Boolean).join(' ').trim();
  const unitLabel =
    display?.unitLabel?.trim() ||
    pickFriendly(data, 'unit_number', 'unitNumber') ||
    pickFriendly(data, 'unit_id', 'unitId');

  if (name) detailParts.push(name);
  if (email && email !== name) detailParts.push(email);
  if (unitLabel) detailParts.push(`unit ${unitLabel}`);

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
