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
    return `${options.changesDetected} change(s) pending review.`;
  }
  return `${options.changesDetected} change(s) detected.`;
}
