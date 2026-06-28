/** Minimum length for user-chosen passwords (create user, change password, invite). */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Requires uppercase, lowercase, digit, and at least one non-alphanumeric character.
 * Does not restrict which special characters may appear (e.g. hyphen is allowed).
 */
export const PASSWORD_COMPLEXITY_PATTERN = new RegExp(
  '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).+$',
);

export const PASSWORD_COMPLEXITY_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and special character';
