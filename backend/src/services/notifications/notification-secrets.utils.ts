/**
 * Helpers for masking / merging encrypted secrets in notifications.config.
 */

import type { NotificationsConfig } from '@/types/notification.types';
import {
  encryptSecret,
  isSecretMask,
  maskSecret,
  decryptSecret,
} from '@/utils/settings-secret.util';

/**
 * Return a copy of config safe for API responses (secrets masked).
 */
export function maskNotificationSecrets(config: NotificationsConfig): NotificationsConfig {
  const next: NotificationsConfig = JSON.parse(JSON.stringify(config));
  if (next.twilio?.authToken) {
    next.twilio.authToken = maskSecret(next.twilio.authToken);
  }
  if (next.smtp?.password) {
    next.smtp.password = maskSecret(next.smtp.password);
  }
  return next;
}

/**
 * Merge incoming notification settings with the previously stored config.
 * - Masked secrets mean "keep existing"
 * - New plaintext secrets are encrypted before persistence
 * - Stored ciphertext is preserved when masked
 */
export function prepareNotificationsConfigForSave(
  incoming: NotificationsConfig,
  existingRaw: string | null,
): NotificationsConfig {
  let existing: NotificationsConfig | null = null;
  if (existingRaw) {
    try {
      existing = JSON.parse(existingRaw) as NotificationsConfig;
    } catch {
      existing = null;
    }
  }

  const next: NotificationsConfig = JSON.parse(JSON.stringify(incoming));

  // Twilio auth token
  if (next.twilio) {
    const incomingToken = next.twilio.authToken;
    if (isSecretMask(incomingToken)) {
      next.twilio.authToken = existing?.twilio?.authToken || '';
    } else if (incomingToken) {
      next.twilio.authToken = encryptSecret(incomingToken);
    }
  }

  // SMTP password
  if (next.smtp) {
    const incomingPassword = next.smtp.password;
    if (isSecretMask(incomingPassword)) {
      next.smtp.password = existing?.smtp?.password || '';
    } else if (incomingPassword) {
      next.smtp.password = encryptSecret(incomingPassword);
    }
  }

  return next;
}

/**
 * Decrypt secrets in a configOverride payload from the test endpoint
 * (client may send masked values — resolve from stored config).
 */
export function resolveConfigOverrideSecrets(
  override: NotificationsConfig,
  stored: NotificationsConfig,
): NotificationsConfig {
  const next: NotificationsConfig = JSON.parse(JSON.stringify(override));
  if (next.twilio) {
    if (isSecretMask(next.twilio.authToken)) {
      next.twilio.authToken = decryptSecret(stored.twilio?.authToken || '');
    }
  }
  if (next.smtp) {
    if (isSecretMask(next.smtp.password)) {
      next.smtp.password = decryptSecret(stored.smtp?.password || '');
    }
  }
  return next;
}
