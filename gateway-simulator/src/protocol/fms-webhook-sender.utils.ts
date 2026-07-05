import { createHmac } from 'crypto';

export type FmsWebhookAuthMode = 'hmac' | 'header_secret' | 'none';

export type FmsWebhookAuthConfig = {
  mode: FmsWebhookAuthMode;
  secret?: string;
  authHeader?: string;
  signatureHeader?: string;
  bearer?: boolean;
};

export function signStoredgeWebhookBody(bodyString: string, secret: string): string {
  return createHmac('sha256', secret).update(bodyString).digest('hex');
}

export function buildWebhookAuthHeaders(
  bodyString: string,
  auth: FmsWebhookAuthConfig,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const mode = auth.mode ?? 'hmac';
  const secret = auth.secret;

  if (mode === 'hmac') {
    if (!secret) {
      throw new Error('HMAC webhook auth requires a signing secret');
    }
    const signatureHeader = auth.signatureHeader?.trim() || 'X-Storable-Signature';
    headers[signatureHeader] = signStoredgeWebhookBody(bodyString, secret);
  } else if (mode === 'header_secret') {
    if (!secret) {
      throw new Error('Header secret webhook auth requires a shared secret');
    }
    const headerName = auth.authHeader?.trim() || 'Authorization';
    headers[headerName] =
      auth.bearer === false ? secret : secret.startsWith('Bearer ') ? secret : `Bearer ${secret}`;
  } else if (mode !== 'none') {
    throw new Error(`Unknown webhook auth mode: ${mode}`);
  }

  return headers;
}

export function resolveWebhookAuthFromSyncSettings(syncSettings?: {
  webhookAuthMode?: FmsWebhookAuthMode;
  webhookSecret?: string;
  webhookAuthHeader?: string;
  webhookSignatureHeader?: string;
}): FmsWebhookAuthConfig {
  const mode = syncSettings?.webhookAuthMode ?? (syncSettings?.webhookSecret ? 'hmac' : 'none');
  return {
    mode,
    secret: syncSettings?.webhookSecret,
    authHeader: syncSettings?.webhookAuthHeader,
    signatureHeader: syncSettings?.webhookSignatureHeader,
  };
}

export function resolveWebhookAuthFromTarget(target: {
  authMode: FmsWebhookAuthMode;
  webhookSecret?: string;
  webhookAuthHeader?: string;
  webhookSignatureHeader?: string;
}): FmsWebhookAuthConfig {
  return {
    mode: target.authMode,
    secret: target.webhookSecret,
    authHeader: target.webhookAuthHeader,
    signatureHeader: target.webhookSignatureHeader,
  };
}

export function isWebhookAuthReady(auth: FmsWebhookAuthConfig): boolean {
  const mode = auth.mode ?? 'hmac';
  if (mode === 'none') return true;
  if (mode === 'hmac' || mode === 'header_secret') {
    return Boolean(auth.secret?.trim());
  }
  return false;
}

export type FmsWebhookSendResult = {
  status: number;
  ok: boolean;
  body: unknown;
  rawBody: string;
};

export async function postFmsWebhook(
  fetchFn: typeof fetch,
  url: string,
  body: unknown,
  auth: FmsWebhookAuthConfig,
  extraHeaders: Record<string, string> = {},
): Promise<FmsWebhookSendResult> {
  const bodyString = JSON.stringify(body);
  const headers = buildWebhookAuthHeaders(bodyString, auth, extraHeaders);

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: bodyString,
  });

  const rawBody = await res.text();
  let parsed: unknown = rawBody;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // keep raw string
  }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    rawBody,
  };
}
