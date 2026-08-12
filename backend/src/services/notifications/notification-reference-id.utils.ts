import { createHash } from 'crypto';

/** Matches `notifications.reference_id` column width (migration 042). */
export const NOTIFICATION_REFERENCE_ID_MAX_LENGTH = 36;

/**
 * Ensure a reference id fits the DB column. Short values pass through;
 * longer ones (e.g. API paths) become a stable SHA-256 prefix for dedup.
 */
export function capNotificationReferenceId(value: string): string {
  if (value.length <= NOTIFICATION_REFERENCE_ID_MAX_LENGTH) {
    return value;
  }
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}
