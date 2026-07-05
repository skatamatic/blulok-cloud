import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildWebhookAuthHeaders,
  isWebhookAuthReady,
  postFmsWebhook,
  resolveWebhookAuthFromSyncSettings,
  signStoredgeWebhookBody,
} from '../src/protocol/fms-webhook-sender.utils';

describe('fms-webhook-sender.utils', () => {
  it('signs storedge webhook body with sha256 hex', () => {
    const body = '{"id":"evt-1"}';
    const secret = 'test-secret';
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    expect(signStoredgeWebhookBody(body, secret)).toBe(expected);
  });

  it('builds HMAC auth headers', () => {
    const body = '{"id":"evt-1"}';
    const headers = buildWebhookAuthHeaders(body, {
      mode: 'hmac',
      secret: 'secret',
      signatureHeader: 'X-Storable-Signature',
    });
    expect(headers['X-Storable-Signature']).toBe(signStoredgeWebhookBody(body, 'secret'));
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('builds header_secret auth with Bearer prefix', () => {
    const headers = buildWebhookAuthHeaders('{}', {
      mode: 'header_secret',
      secret: 'my-shared-secret',
      authHeader: 'Authorization',
    });
    expect(headers.Authorization).toBe('Bearer my-shared-secret');
  });

  it('builds none auth without credentials', () => {
    const headers = buildWebhookAuthHeaders('{}', { mode: 'none' });
    expect(headers['X-Storable-Signature']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('resolves auth from syncSettings', () => {
    expect(
      resolveWebhookAuthFromSyncSettings({
        webhookAuthMode: 'header_secret',
        webhookSecret: 'abc',
        webhookAuthHeader: 'X-Custom',
      }),
    ).toEqual({
      mode: 'header_secret',
      secret: 'abc',
      authHeader: 'X-Custom',
      signatureHeader: undefined,
    });
  });

  it('isWebhookAuthReady returns true for none mode without secret', () => {
    expect(isWebhookAuthReady({ mode: 'none' })).toBe(true);
  });

  it('isWebhookAuthReady requires secret for hmac and header_secret', () => {
    expect(isWebhookAuthReady({ mode: 'hmac', secret: 'x' })).toBe(true);
    expect(isWebhookAuthReady({ mode: 'hmac' })).toBe(false);
    expect(isWebhookAuthReady({ mode: 'header_secret', secret: 'x' })).toBe(true);
    expect(isWebhookAuthReady({ mode: 'header_secret', secret: '  ' })).toBe(false);
  });

  it('posts webhook and parses JSON response', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, syncLogId: 'log-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await postFmsWebhook(
      fetchFn as unknown as typeof fetch,
      'http://127.0.0.1:3000/api/v1/fms/webhook/fac-1',
      { id: 'evt-1', type: 'com.storedge.tenant.updated.v1', body: {} },
      { mode: 'none' },
    );

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ success: true, syncLogId: 'log-1' });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
