import {
  FMSApplyErrorDetail,
  FMSChange,
  FMSChangeType,
} from '@/types/fms.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Best-effort human label for a change (unit number, email, name).
 * Avoids returning a bare UUID when a better label exists.
 */
export function resolveFmsChangeEntityLabel(change: FMSChange): string {
  const after = asRecord(change.after_data);
  const before = asRecord(change.before_data);

  const unitNumber =
    nonEmptyString(after?.unitNumber) ?? nonEmptyString(before?.unitNumber);
  if (unitNumber && !looksLikeUuid(unitNumber)) {
    return unitNumber;
  }

  const email = nonEmptyString(after?.email) ?? nonEmptyString(before?.email);
  if (email) {
    return email;
  }

  const firstName =
    nonEmptyString(after?.firstName) ?? nonEmptyString(before?.firstName);
  const lastName =
    nonEmptyString(after?.lastName) ?? nonEmptyString(before?.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  const impact = nonEmptyString(change.impact_summary);
  if (impact) {
    // e.g. "Update unit 101" / "New unit: A-12 - Will be added..."
    const unitMatch = impact.match(/\bunit\s+([A-Za-z0-9._/-]+)/i);
    if (unitMatch?.[1] && !looksLikeUuid(unitMatch[1])) {
      return unitMatch[1];
    }
  }

  if (change.external_id && !looksLikeUuid(change.external_id)) {
    return change.external_id;
  }

  return change.entity_type === 'unit' ? 'a unit' : 'a tenant';
}

export function buildFmsApplyErrorDetail(
  change: FMSChange,
  error: unknown,
): FMSApplyErrorDetail {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    changeId: change.id,
    changeType: change.change_type as FMSChangeType,
    entityType: change.entity_type,
    externalId: change.external_id,
    entityLabel: resolveFmsChangeEntityLabel(change),
    message,
  };
}

/** Compact fallback string without embedding UUIDs. */
export function formatFmsApplyErrorFallback(detail: FMSApplyErrorDetail): string {
  return `${detail.changeType}: ${detail.message}`;
}
