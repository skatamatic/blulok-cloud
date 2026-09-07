import { describe, expect, it } from 'vitest';
import {
  mapFmsConfigToWebhookTarget,
  toPublicWebhookTargetSummary,
} from '../src/main/fms/fms-webhook-target.utils';
import type { FmsConfigRecord } from '../src/main/auth/backend-api.types';

function sampleConfig(overrides: Partial<FmsConfigRecord> = {}): FmsConfigRecord {
  return {
    id: 'cfg-1',
    facility_id: 'fac-1',
    facility_name: 'Test Facility',
    provider_type: 'storedge',
    is_enabled: true,
    config: {
      customSettings: { facilityId: 'ext-fac-99' },
      syncSettings: {
        webhookAuthMode: 'hmac',
        webhookSecret: 'signing-secret',
        webhookSignatureHeader: 'X-Storable-Signature',
      },
    },
    ...overrides,
  };
}

describe('fms-webhook-target.utils', () => {
  it('maps FMS config to internal target with webhook URL and auth', () => {
    const internal = mapFmsConfigToWebhookTarget(sampleConfig(), 'http://127.0.0.1:3000');

    expect(internal.facilityId).toBe('fac-1');
    expect(internal.externalFacilityId).toBe('ext-fac-99');
    expect(internal.hasExternalFacilityId).toBe(true);
    expect(internal.authMode).toBe('hmac');
    expect(internal.authReady).toBe(true);
    expect(internal.webhookSecret).toBe('signing-secret');
    expect(internal.webhookUrl).toContain('/api/v1/fms/webhook/fac-1');
  });

  it('marks authReady false when HMAC secret is missing', () => {
    const internal = mapFmsConfigToWebhookTarget(
      sampleConfig({
        config: {
          syncSettings: { webhookAuthMode: 'hmac' },
        },
      }),
      'http://127.0.0.1:3000',
    );

    expect(internal.authReady).toBe(false);
  });

  it('strips secrets from public summary', () => {
    const internal = mapFmsConfigToWebhookTarget(sampleConfig(), 'http://127.0.0.1:3000');
    const publicSummary = toPublicWebhookTargetSummary(internal);

    expect(publicSummary.authReady).toBe(true);
    expect(publicSummary.hasExternalFacilityId).toBe(true);
    expect('webhookSecret' in publicSummary).toBe(false);
  });

  it('falls back to facility_id when custom external id is absent', () => {
    const internal = mapFmsConfigToWebhookTarget(
      sampleConfig({ config: { syncSettings: { webhookAuthMode: 'none' } } }),
      'http://127.0.0.1:3000',
    );

    expect(internal.externalFacilityId).toBe('fac-1');
    expect(internal.hasExternalFacilityId).toBe(false);
    expect(internal.authReady).toBe(true);
  });
});
