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

  if (!hasFmsTenantLoginIdentity(tenant)) {
    errors.push('Missing or empty login identity (email or phone number)');
  }

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

  if (!hasFmsTenantLoginIdentity(tenant)) {
    errors.push('Tenant must have an email or phone number');
  }

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
  return 'no contact info';
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
