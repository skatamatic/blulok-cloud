/**
 * FMS placeholder (non-loginable) tenant helpers.
 *
 * Placeholders are real `users` rows with no email/phone. They use a reserved
 * `login_identifier` namespace and `is_placeholder=true` so Auth never accepts them.
 * FMS entity identity remains on `fms_entity_mappings.external_id`.
 */

export const FMS_PLACEHOLDER_LOGIN_PREFIX = 'fms-ph:';

/** Unusable bcrypt-looking hash for invite-style accounts (never a real password). */
export const FMS_PLACEHOLDER_PASSWORD_HASH = '$2b$10$dummyhashforinvitationflow';

/**
 * Build a unique, non-email/non-phone login_identifier for a placeholder tenant.
 * Facility-scoped so the same FMS person at two facilities stays distinct.
 * Encodes ids (instead of stripping chars) so distinct external ids cannot collide.
 */
export function buildFmsPlaceholderLoginIdentifier(
  facilityId: string,
  externalId: string,
): string {
  const facility = String(facilityId || '').trim().toLowerCase();
  const external = String(externalId || '').trim().toLowerCase();
  if (!facility || !external) {
    throw new Error('facilityId and externalId are required for placeholder login identifier');
  }
  return `${FMS_PLACEHOLDER_LOGIN_PREFIX}${encodeURIComponent(facility)}:${encodeURIComponent(external)}`;
}

export function isFmsPlaceholderLoginIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().toLowerCase().startsWith(FMS_PLACEHOLDER_LOGIN_PREFIX);
}

export type PlaceholderIdentityFields = {
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  login_identifier?: string | null;
  is_placeholder?: boolean | number | null;
};

/** True when the user row is a non-loginable FMS placeholder. */
export function isPlaceholderUser(user: PlaceholderIdentityFields | null | undefined): boolean {
  if (!user) return false;
  if (user.is_placeholder === true || user.is_placeholder === 1) return true;
  return isFmsPlaceholderLoginIdentifier(user.login_identifier);
}

export type UpgradePlaceholderInput = {
  email?: string | null;
  phoneE164?: string | null;
};

/** Column updates applied when upgrading a placeholder to a loginable user. */
export type PlaceholderUpgradeUpdates = {
  email: string | null;
  phone_number: string | null;
  login_identifier: string;
  is_placeholder: boolean;
  requires_password_reset: boolean;
};

/**
 * Compute user-column updates to upgrade a placeholder when contact arrives.
 * Caller must resolve uniqueness conflicts before applying.
 */
export function buildPlaceholderUpgradeUpdates(
  input: UpgradePlaceholderInput,
): PlaceholderUpgradeUpdates | null {
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : '';
  const phone = input.phoneE164?.trim() ? input.phoneE164.trim() : '';
  if (!email && !phone) return null;

  const loginIdentifier = email || phone.toLowerCase();
  return {
    email: email || null,
    phone_number: phone || null,
    login_identifier: loginIdentifier,
    is_placeholder: false,
    requires_password_reset: true,
  };
}
