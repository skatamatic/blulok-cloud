/**
 * FMS webhook route — auth mode integration (real FMSService + StoredgeProvider).
 */
jest.unmock('@/services/fms/fms.service');

import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { fmsWebhookRouter } from '@/routes/fms-webhook.routes';
import { FMSService } from '@/services/fms/fms.service';
import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSAuthType, FMSProviderType, FMSWebhookAuthMode } from '@/types/fms.types';

const facilityId = '550e8400-e29b-41d4-a716-446655440099';
const extFacId = 'ext-storedge-fac-99';
const webhookSecret = 'integration-webhook-secret';

function buildApp() {
  const app = express();
  app.use(
    '/api/v1/fms/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    fmsWebhookRouter
  );
  return app;
}

function signHmac(body: string): string {
  return crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
}

function tenantUpdatedEnvelope(eventId: string) {
  return {
    id: eventId,
    type: 'com.storedge.tenant.updated.v1',
    body: {
      facility_id: extFacId,
      tenant_id: 'tenant-ext-99',
      email: 'wh@example.com',
      first_name: 'Webhook',
      last_name: 'Test',
    },
  };
}

function mockFmsConfig(syncSettings: Record<string, unknown>) {
  return {
    id: 'cfg-auth-int',
    facility_id: facilityId,
    provider_type: FMSProviderType.STOREDGE,
    is_enabled: true,
    config: {
      providerType: FMSProviderType.STOREDGE,
      baseUrl: 'https://api.storedge.com',
      auth: {
        type: FMSAuthType.OAUTH1,
        credentials: { consumerKey: 'k', consumerSecret: 's' },
      },
      features: {
        supportsTenantSync: true,
        supportsUnitSync: true,
        supportsWebhooks: true,
        supportsRealtime: false,
      },
      syncSettings,
      customSettings: { facilityId: extFacId },
    },
  };
}

describe('POST /api/v1/fms/webhook/:facilityId auth modes (integration)', () => {
  const findByFacilityId = jest.fn();
  const findByExternalEventId = jest.fn();
  const deleteByExternalEventId = jest.fn();
  const createWebhookRecord = jest.fn();
  const markProcessed = jest.fn();
  const syncLogCreate = jest.fn();
  const syncLogUpdate = jest.fn();
  const syncLogMarkCompleted = jest.fn();
  const syncLogMarkPendingReview = jest.fn();
  const changeCreate = jest.fn();
  const findByExternalId = jest.fn();
  const findOpenWebhookReviewSyncLog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (FMSService as unknown as { instance?: unknown }).instance = undefined;

    findByExternalEventId.mockResolvedValue(null);
    createWebhookRecord.mockImplementation(async (data: { external_event_id: string }) => ({
      id: 'wh-auth',
      facility_id: facilityId,
      external_event_id: data.external_event_id,
      event_type: 'tenant.updated',
      received_at: new Date(),
      processed_at: null,
      sync_log_id: 'sync-auth',
    }));
    syncLogCreate.mockResolvedValue({ id: 'sync-auth', changes_detected: 0, changes_pending: 0 });
    findByExternalId.mockResolvedValue({ internal_id: 'user-int', external_id: 'tenant-ext-99' });
    findOpenWebhookReviewSyncLog.mockResolvedValue(null);
    changeCreate.mockImplementation(async (insert: { external_id: string }) => ({
      id: 'change-auth',
      ...insert,
    }));

    const svc = FMSService.getInstance();
    svc.registerProvider(FMSProviderType.STOREDGE, StoredgeProvider as never);
    (svc as unknown as { fmsConfigModel: { findByFacilityId: typeof findByFacilityId } }).fmsConfigModel = {
      findByFacilityId,
    };
    (svc as unknown as { webhookEventModel: Record<string, jest.Mock> }).webhookEventModel = {
      findByExternalEventId,
      deleteByExternalEventId,
      create: createWebhookRecord,
      markProcessed,
      markFailed: jest.fn(),
      markIgnored: jest.fn(),
      isProcessed: (record: { processed_at?: Date | null }) => record.processed_at != null,
    };
    (svc as unknown as { syncLogModel: Record<string, jest.Mock> }).syncLogModel = {
      create: syncLogCreate,
      update: syncLogUpdate,
      markCompleted: syncLogMarkCompleted,
      markPendingReview: syncLogMarkPendingReview,
      findOpenWebhookReviewSyncLog,
    };
    (svc as unknown as { changeModel: { create: typeof changeCreate } }).changeModel = {
      create: changeCreate,
    };
    (svc as unknown as { entityMappingModel: { findByExternalId: typeof findByExternalId } }).entityMappingModel = {
      findByExternalId,
    };
    (svc as unknown as { broadcastFMSSyncUpdate: jest.Mock }).broadcastFMSSyncUpdate = jest.fn();
    (svc as unknown as { getFacilityName: jest.Mock }).getFacilityName = jest
      .fn()
      .mockResolvedValue('Test Facility');
    (svc as unknown as { notifyFmsWebhookReceived: jest.Mock }).notifyFmsWebhookReceived = jest.fn();
  });

  it('accepts HMAC mode with valid X-Storable-Signature', async () => {
    findByFacilityId.mockResolvedValue(
      mockFmsConfig({
        autoAcceptChanges: false,
        webhookSecret,
        webhookAuthMode: FMSWebhookAuthMode.HMAC,
      })
    );

    const envelope = tenantUpdatedEnvelope('evt-hmac-ok');
    const body = JSON.stringify(envelope);

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .set('X-Storable-Signature', signHmac(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects HMAC mode with invalid signature', async () => {
    findByFacilityId.mockResolvedValue(
      mockFmsConfig({
        autoAcceptChanges: false,
        webhookSecret,
        webhookAuthMode: FMSWebhookAuthMode.HMAC,
      })
    );

    const body = JSON.stringify(tenantUpdatedEnvelope('evt-hmac-bad'));

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .set('X-Storable-Signature', 'not-valid')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('accepts header_secret mode with Bearer Authorization', async () => {
    findByFacilityId.mockResolvedValue(
      mockFmsConfig({
        autoAcceptChanges: false,
        webhookSecret,
        webhookAuthMode: FMSWebhookAuthMode.HEADER_SECRET,
        webhookAuthHeader: 'Authorization',
      })
    );

    const body = JSON.stringify(tenantUpdatedEnvelope('evt-header-ok'));

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${webhookSecret}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects header_secret mode with wrong Authorization', async () => {
    findByFacilityId.mockResolvedValue(
      mockFmsConfig({
        autoAcceptChanges: false,
        webhookSecret,
        webhookAuthMode: FMSWebhookAuthMode.HEADER_SECRET,
        webhookAuthHeader: 'Authorization',
      })
    );

    const body = JSON.stringify(tenantUpdatedEnvelope('evt-header-bad'));

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer wrong-secret')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('accepts none mode without auth headers', async () => {
    findByFacilityId.mockResolvedValue(
      mockFmsConfig({
        autoAcceptChanges: false,
        webhookAuthMode: FMSWebhookAuthMode.NONE,
      })
    );

    const body = JSON.stringify(tenantUpdatedEnvelope('evt-none-ok'));

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
