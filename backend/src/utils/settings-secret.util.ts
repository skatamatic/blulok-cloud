/**
 * AES-256-GCM helpers for encrypting sensitive system_settings values at rest.
 *
 * Format: `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
 * Legacy plaintext values pass through decrypt unchanged so existing
 * Twilio tokens keep working until the next save.
 */

import crypto from 'crypto';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';

/** Sentinel returned to clients in place of a real secret. */
export const SECRET_MASK = '••••••';

function getKey(): Buffer | null {
  const raw = config.settingsEncryptionKey;
  if (!raw) return null;
  // Accept 64-char hex or 32+ char utf8 (hashed to 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function isSecretMask(value: string | null | undefined): boolean {
  return value === SECRET_MASK;
}

/**
 * Encrypt a plaintext secret. Returns plaintext unchanged when no key is configured
 * (development without SETTINGS_ENCRYPTION_KEY).
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncryptedSecret(plaintext)) return plaintext;

  const key = getKey();
  if (!key) {
    logger.warn('SETTINGS_ENCRYPTION_KEY not set; storing secret in plaintext');
    return plaintext;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a secret. Returns plaintext values unchanged (legacy compatibility).
 */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (!isEncryptedSecret(value)) return value;

  const key = getKey();
  if (!key) {
    throw new Error('Encrypted secret present but SETTINGS_ENCRYPTION_KEY is not configured');
  }

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Mask a secret for API responses. Empty values stay empty.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  return SECRET_MASK;
}
