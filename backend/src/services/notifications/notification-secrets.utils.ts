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
 * Copy of a raw settings payload with credentials replaced, for debug logging.
 * The PUT body carries plaintext Twilio/SMTP secrets that must never reach logs.
 */
export function redactNotificationSecretsForLog(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const source = body as Record<string, any>;
  const next: Record<string, any> = { ...source };
  if (source['twilio'] && typeof source['twilio'] === 'object') {
    next['twilio'] = { ...source['twilio'], authToken: source['twilio'].authToken ? '[redacted]' : '' };
  }
  if (source['smtp'] && typeof source['smtp'] === 'object') {
    next['smtp'] = { ...source['smtp'], password: source['smtp'].password ? '[redacted]' : '' };
  }
  return next;
}

/** Sections merged key-by-key so a partial PUT cannot drop sibling fields. */
const MERGEABLE_SECTIONS = [
  'enabledChannels',
  'defaultProvider',
  'twilio',
  'smtp',
  'templates',
] as const;

type ConfigRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drop `undefined` keys so spreading a partial payload cannot erase stored values. */
function withoutUndefined(source: ConfigRecord): ConfigRecord {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined));
}

/**
 * Blank or masked means "keep what is stored". Only a real new value is encrypted,
 * so a partial save can never silently wipe Twilio/SMTP credentials.
 */
function resolveStoredSecret(incomingValue: unknown, existingCiphertext: unknown): string {
  const existing = typeof existingCiphertext === 'string' ? existingCiphertext : '';
  if (typeof incomingValue !== 'string' || incomingValue === '' || isSecretMask(incomingValue)) {
    return existing;
  }
  return encryptSecret(incomingValue);
}

/**
 * Merge incoming notification settings with the previously stored config.
 * - Sections omitted from the payload keep their stored values
 * - Masked or blank secrets mean "keep existing"
 * - New plaintext secrets are encrypted before persistence
 */
export function prepareNotificationsConfigForSave(
  incoming: NotificationsConfig,
  existingRaw: string | null,
): NotificationsConfig {
  let existing: ConfigRecord = {};
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (isPlainObject(parsed)) existing = parsed;
    } catch {
      existing = {};
    }
  }

  const incomingRecord = withoutUndefined(incoming as unknown as ConfigRecord);
  const next: ConfigRecord = { ...existing, ...incomingRecord };

  for (const section of MERGEABLE_SECTIONS) {
    const incomingSection = incomingRecord[section];
    const existingSection = existing[section];
    if (incomingSection === undefined) {
      if (existingSection !== undefined) next[section] = existingSection;
      continue;
    }
    if (isPlainObject(incomingSection) && isPlainObject(existingSection)) {
      next[section] = { ...existingSection, ...withoutUndefined(incomingSection) };
    }
  }

  const merged = JSON.parse(JSON.stringify(next)) as NotificationsConfig;

  const incomingTwilio = incomingRecord['twilio'];
  if (merged.twilio) {
    merged.twilio.authToken = resolveStoredSecret(
      isPlainObject(incomingTwilio) ? incomingTwilio['authToken'] : undefined,
      (existing['twilio'] as ConfigRecord | undefined)?.['authToken'],
    );
  }

  const incomingSmtp = incomingRecord['smtp'];
  if (merged.smtp) {
    merged.smtp.password = resolveStoredSecret(
      isPlainObject(incomingSmtp) ? incomingSmtp['password'] : undefined,
      (existing['smtp'] as ConfigRecord | undefined)?.['password'],
    );
  }

  return merged;
}

/**
 * Decrypt secrets in a configOverride payload from the test endpoint.
 * The client sends a mask (or nothing) for untouched secrets, so both resolve
 * from the stored config — otherwise a "test" would run without credentials
 * and report a failure the saved settings would not have.
 */
export function resolveConfigOverrideSecrets(
  override: NotificationsConfig,
  stored: NotificationsConfig,
): NotificationsConfig {
  const next: NotificationsConfig = JSON.parse(JSON.stringify(override));
  if (next.twilio && (!next.twilio.authToken || isSecretMask(next.twilio.authToken))) {
    next.twilio.authToken = decryptSecret(stored.twilio?.authToken || '');
  }
  if (next.smtp && (!next.smtp.password || isSecretMask(next.smtp.password))) {
    next.smtp.password = decryptSecret(stored.smtp?.password || '');
  }
  return next;
}
