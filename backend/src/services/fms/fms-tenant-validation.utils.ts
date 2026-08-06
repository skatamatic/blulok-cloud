import { toE164 } from '@/utils/phone.util';

export type FmsTenantValidationPayload = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  login_identifier?: string | null;
};

/** Sync detection: tenant needs email and/or phone for login. (Placeholders allowed without contact.) */
export const FMS_TENANT_MISSING_CONTACT_SYNC =
  'Missing both email and phone number';

/** Webhook payloads: same rule, slightly different wording. (Placeholders allowed without contact.) */
export const FMS_TENANT_MISSING_CONTACT_WEBHOOK =
  'Tenant must have an email or a phone number — both are missing';

/** Persisted identity / contact messages that should be rewritten for display. */
const IDENTITY_ERROR_RE =
  /username\s*\(email\)|missing or empty username|login identity \(email or phone|must have an email or(?: a)? phone|missing both email and phone|tenant must have an email/i;

function readTenantField(
  tenant: FmsTenantValidationPayload,
  camel: 'email' | 'phone' | 'firstName' | 'lastName',
  snake: 'email' | 'phone' | 'first_name' | 'last_name',
): string {
  const value = tenant[camel] ?? tenant[snake];
  return typeof value === 'string' ? value.trim() : '';
}

/** True when the tenant has a non-empty email or phone suitable for login. */
export function hasFmsTenantLoginIdentity(tenant: FmsTenantValidationPayload): boolean {
  const email = readTenantField(tenant, 'email', 'email');
  if (email) return true;
  const phone = readTenantField(tenant, 'phone', 'phone');
  return phone.length > 0;
}

/** Preferred login identifier: email (lowercased) or normalized phone (lowercased E.164). */
export function resolveFmsTenantLoginIdentifier(
  rawEmail?: string | null,
  rawPhone?: string | null,
): string {
  const email = rawEmail?.trim() || '';
  if (email) return email.toLowerCase();
  const phone = rawPhone?.trim() || '';
  if (!phone) return '';
  return toE164(phone).toLowerCase();
}

/** Validation used during full FMS sync change detection (requires first and last name). */
export function validateFmsTenantSyncFields(tenant: FmsTenantValidationPayload): string[] {
  const errors: string[] = [];

  // Missing email+phone is allowed: sync creates a non-loginable placeholder tenant.

  const firstName = readTenantField(tenant, 'firstName', 'first_name');
  if (!firstName) {
    errors.push('Missing or empty first name');
  }

  const lastName = readTenantField(tenant, 'lastName', 'last_name');
  if (!lastName) {
    errors.push('Missing or empty last name');
  }

  return errors;
}

/** Validation for webhook / lightweight tenant payloads (first or last name suffices). */
export function validateFmsTenantWebhookFields(tenant: FmsTenantValidationPayload): string[] {
  const errors: string[] = [];

  // Missing email+phone is allowed: apply creates a non-loginable placeholder tenant.

  const firstName = readTenantField(tenant, 'firstName', 'first_name');
  const lastName = readTenantField(tenant, 'lastName', 'last_name');
  if (!firstName && !lastName) {
    errors.push('Tenant must have a first or last name');
  }

  return errors;
}

/** Derive validation errors for API responses when DB rows lack explicit messages. */
export function deriveFmsTenantValidationErrors(tenant: FmsTenantValidationPayload): string[] {
  return validateFmsTenantSyncFields(tenant);
}

export function formatFmsTenantContactLabel(tenant: { email?: string | null; phone?: string | null }): string {
  const email = tenant.email?.trim();
  if (email) return email;
  const phone = tenant.phone?.trim();
  if (phone) return phone;
  return 'placeholder — no login';
}

function refreshImpactSummaryContactLabel(
  impactSummary: string | undefined,
  tenant: FmsTenantValidationPayload,
): string | undefined {
  if (!impactSummary) return impactSummary;
  const contactLabel = formatFmsTenantContactLabel(tenant);
  return impactSummary
    .replace(/\(no email\)/gi, `(${contactLabel})`)
    .replace(/\(no contact info\)/gi, `(${contactLabel})`);
}

/**
 * Refresh persisted tenant change display fields for current email-or-phone rules.
 * Rewrites stale "username (email)" / "(no email)" copy without requiring a re-sync.
 * Does not clear unrelated validation errors (e.g. unmapped tenant).
 */
export function refreshPendingTenantChangeForDisplay<
  T extends {
    entity_type?: string;
    is_valid?: boolean | number | null;
    validation_errors?: string[] | null;
    impact_summary?: string;
    after_data?: unknown;
    before_data?: unknown;
  },
>(change: T): T {
  if (change.entity_type !== 'tenant') return change;

  const tenantPayload = (change.after_data ?? change.before_data) as
    | FmsTenantValidationPayload
    | null
    | undefined;
  if (!tenantPayload || typeof tenantPayload !== 'object') return change;

  const isInvalid = change.is_valid === false || change.is_valid === 0;
  const existingErrors = Array.isArray(change.validation_errors) ? change.validation_errors : [];
  const impactSummary = refreshImpactSummaryContactLabel(change.impact_summary, tenantPayload);

  // Invalid row with no stored errors: derive full sync-field messages.
  if (isInvalid && existingErrors.length === 0) {
    const derived = deriveFmsTenantValidationErrors(tenantPayload);
    if (derived.length === 0) {
      return {
        ...change,
        is_valid: true,
        validation_errors: [],
        impact_summary: impactSummary ?? change.impact_summary,
      };
    }
    return {
      ...change,
      validation_errors: derived,
      impact_summary: impactSummary ?? change.impact_summary,
    };
  }

  const hasIdentityErrors = existingErrors.some((e) => IDENTITY_ERROR_RE.test(e));
  if (!hasIdentityErrors && impactSummary === change.impact_summary) {
    return change;
  }

  let nextErrors = existingErrors;
  if (hasIdentityErrors) {
    // Contact-only identity errors are obsolete (placeholders allowed); strip them.
    const withoutIdentity = existingErrors.filter((e) => !IDENTITY_ERROR_RE.test(e));
    nextErrors = [...new Set(withoutIdentity)];
  }

  const nextValid =
    isInvalid && nextErrors.length === 0
      ? true
      : change.is_valid;

  if (
    nextValid === change.is_valid &&
    impactSummary === change.impact_summary &&
    nextErrors.length === existingErrors.length &&
    nextErrors.every((e, i) => e === existingErrors[i])
  ) {
    return change;
  }

  return {
    ...change,
    is_valid: nextValid,
    validation_errors: nextErrors,
    impact_summary: impactSummary ?? change.impact_summary,
  };
}

type FacilityUserLike = {
  id: string;
  email?: string | null;
  phone_number?: string | null;
  login_identifier?: string | null;
};

/** Resolve an existing facility user for an incoming FMS tenant (mapping, email, or phone). */
export function findExistingUserForFmsTenant<T extends FacilityUserLike>(
  fmsTenant: { email?: string | null; phone?: string | null },
  mapping: { internal_id: string } | undefined,
  usersById: Map<string, T>,
  usersByEmail: Map<string, T>,
  usersByPhone: Map<string, T>,
  usersByLoginIdentifier: Map<string, T>,
): T | undefined {
  if (mapping) {
    return usersById.get(mapping.internal_id);
  }

  const email = fmsTenant.email?.trim();
  if (email) {
    const byEmail = usersByEmail.get(email.toLowerCase());
    if (byEmail) return byEmail;
  }

  const phone = fmsTenant.phone?.trim();
  if (phone) {
    const phoneKey = toE164(phone).toLowerCase();
    return usersByPhone.get(phoneKey) ?? usersByLoginIdentifier.get(phoneKey);
  }

  return undefined;
}

export function buildFacilityUserLookupMaps<T extends FacilityUserLike>(
  users: T[],
): {
  usersById: Map<string, T>;
  usersByEmail: Map<string, T>;
  usersByPhone: Map<string, T>;
  usersByLoginIdentifier: Map<string, T>;
} {
  const usersById = new Map(users.map((u) => [u.id, u]));
  const usersByEmail = new Map(
    users
      .filter((u) => typeof u.email === 'string' && u.email.trim().length > 0)
      .map((u) => [u.email!.toLowerCase(), u]),
  );
  const usersByPhone = new Map(
    users
      .filter((u) => typeof u.phone_number === 'string' && u.phone_number.trim().length > 0)
      .map((u) => [u.phone_number!.toLowerCase(), u]),
  );
  const usersByLoginIdentifier = new Map(
    users
      .filter((u) => typeof u.login_identifier === 'string' && u.login_identifier.trim().length > 0)
      .map((u) => [u.login_identifier!.toLowerCase(), u]),
  );

  return { usersById, usersByEmail, usersByPhone, usersByLoginIdentifier };
}
