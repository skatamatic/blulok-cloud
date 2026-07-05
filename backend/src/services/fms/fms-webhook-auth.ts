import crypto from 'crypto';
import { FMSProviderConfig, FMSWebhookAuthMode } from '@/types/fms.types';

export type FmsWebhookAuthHeaders = Record<string, string | string[] | undefined>;

export function resolveWebhookAuthMode(
  syncSettings: FMSProviderConfig['syncSettings']
): FMSWebhookAuthMode {
  if (syncSettings.webhookAuthMode) {
    return syncSettings.webhookAuthMode;
  }
  return FMSWebhookAuthMode.HMAC;
}

function getHeader(headers: FmsWebhookAuthHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0]?.trim() || undefined;
    return typeof value === 'string' ? value.trim() : undefined;
  }
  return undefined;
}

function findFirstHeader(headers: FmsWebhookAuthHeaders, names: string[]): string | undefined {
  for (const name of names) {
    const value = getHeader(headers, name);
    if (value) return value;
  }
  return undefined;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function validateHmacSignature(rawBody: Buffer, secret: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.trim()) {
    return false;
  }

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedPrefixed = `sha256=${expectedHex}`;

  const candidates = [signatureHeader.trim(), signatureHeader.trim().replace(/^sha256=/i, '')];
  for (const candidate of candidates) {
    try {
      const a = Buffer.from(candidate, candidate.length === 64 ? 'hex' : 'utf8');
      const b = Buffer.from(expectedHex, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
      const c = Buffer.from(expectedPrefixed);
      const d = Buffer.from(signatureHeader.trim());
      if (c.length === d.length && crypto.timingSafeEqual(c, d)) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

function validateHeaderSecret(received: string, secret: string): boolean {
  if (timingSafeEqualString(received, secret)) {
    return true;
  }

  const bearerFromReceived = received.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearerFromReceived && timingSafeEqualString(bearerFromReceived, secret)) {
    return true;
  }

  const bearerFromSecret = secret.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearerFromSecret && timingSafeEqualString(received, bearerFromSecret)) {
    return true;
  }

  if (timingSafeEqualString(received, `Bearer ${secret}`)) {
    return true;
  }

  return false;
}

function signatureHeaderCandidates(
  syncSettings: FMSProviderConfig['syncSettings'],
  customSettings?: Record<string, unknown>
): string[] {
  const names = [
    syncSettings.webhookSignatureHeader,
    typeof customSettings?.webhookSignatureHeader === 'string'
      ? customSettings.webhookSignatureHeader
      : undefined,
    'X-Storable-Signature',
    'X-Webhook-Signature',
    'X-Signature',
  ].filter((name): name is string => Boolean(name?.trim()));

  return [...new Set(names.map((n) => n.trim()))];
}

/**
 * Validate inbound FMS webhook authentication per facility syncSettings.
 * Returns invalid with error message "Invalid webhook signature" for auth failures (401).
 */
export function validateFmsWebhookAuth(
  syncSettings: FMSProviderConfig['syncSettings'],
  customSettings: Record<string, unknown> | undefined,
  rawBody: Buffer,
  headers: FmsWebhookAuthHeaders
): { valid: boolean; error?: string; mode: FMSWebhookAuthMode } {
  const mode = resolveWebhookAuthMode(syncSettings);

  if (mode === FMSWebhookAuthMode.NONE) {
    return { valid: true, mode };
  }

  const secret = syncSettings.webhookSecret?.trim();
  if (!secret) {
    return { valid: false, error: 'Invalid webhook signature', mode };
  }

  if (mode === FMSWebhookAuthMode.HEADER_SECRET) {
    const headerName = syncSettings.webhookAuthHeader?.trim() || 'Authorization';
    const received = findFirstHeader(headers, [headerName]);
    if (!received || !validateHeaderSecret(received, secret)) {
      return { valid: false, error: 'Invalid webhook signature', mode };
    }
    return { valid: true, mode };
  }

  const signatureHeader = findFirstHeader(headers, signatureHeaderCandidates(syncSettings, customSettings));
  if (!validateHmacSignature(rawBody, secret, signatureHeader)) {
    return { valid: false, error: 'Invalid webhook signature', mode };
  }

  return { valid: true, mode };
}
