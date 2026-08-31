import crypto from 'crypto';
import { FMSWebhookAuthMode } from '@/types/fms.types';
import { validateFmsWebhookAuth } from '@/services/fms/fms-webhook-auth';

const secret = 'test-webhook-secret';
const body = Buffer.from(JSON.stringify({ id: 'evt-1', type: 'test' }));

function signHmac(raw: Buffer): string {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('validateFmsWebhookAuth', () => {
  describe('HMAC mode (default)', () => {
    it('accepts valid HMAC signature', () => {
      const result = validateFmsWebhookAuth(
        { autoAcceptChanges: false, webhookSecret: secret },
        undefined,
        body,
        { 'X-Storable-Signature': signHmac(body) }
      );
      expect(result.valid).toBe(true);
      expect(result.mode).toBe(FMSWebhookAuthMode.HMAC);
    });

    it('rejects missing secret', () => {
      const result = validateFmsWebhookAuth(
        { autoAcceptChanges: false },
        undefined,
        body,
        { 'X-Storable-Signature': signHmac(body) }
      );
      expect(result.valid).toBe(false);
    });

    it('rejects invalid signature', () => {
      const result = validateFmsWebhookAuth(
        { autoAcceptChanges: false, webhookSecret: secret },
        undefined,
        body,
        { 'X-Storable-Signature': 'bad-signature' }
      );
      expect(result.valid).toBe(false);
    });

    it('uses custom signature header name from syncSettings', () => {
      const sig = signHmac(body);
      const result = validateFmsWebhookAuth(
        {
          autoAcceptChanges: false,
          webhookSecret: secret,
          webhookSignatureHeader: 'X-Custom-Sig',
        },
        undefined,
        body,
        { 'X-Custom-Sig': sig }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('header_secret mode', () => {
    const syncSettings = {
      autoAcceptChanges: false,
      webhookAuthMode: FMSWebhookAuthMode.HEADER_SECRET,
      webhookSecret: secret,
      webhookAuthHeader: 'Authorization',
    };

    it('accepts matching Authorization header', () => {
      const result = validateFmsWebhookAuth(syncSettings, undefined, body, {
        Authorization: secret,
      });
      expect(result.valid).toBe(true);
      expect(result.mode).toBe(FMSWebhookAuthMode.HEADER_SECRET);
    });

    it('accepts Bearer token format', () => {
      const result = validateFmsWebhookAuth(syncSettings, undefined, body, {
        Authorization: `Bearer ${secret}`,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects wrong secret', () => {
      const result = validateFmsWebhookAuth(syncSettings, undefined, body, {
        Authorization: 'wrong',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing header', () => {
      const result = validateFmsWebhookAuth(syncSettings, undefined, body, {});
      expect(result.valid).toBe(false);
    });
  });

  describe('none mode', () => {
    it('accepts without secret or headers', () => {
      const result = validateFmsWebhookAuth(
        { autoAcceptChanges: false, webhookAuthMode: FMSWebhookAuthMode.NONE },
        undefined,
        body,
        {}
      );
      expect(result.valid).toBe(true);
      expect(result.mode).toBe(FMSWebhookAuthMode.NONE);
    });
  });
});
