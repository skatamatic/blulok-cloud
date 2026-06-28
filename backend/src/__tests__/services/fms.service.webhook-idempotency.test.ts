/** Real FMSService — tests webhook retry semantics after failed deliveries. */
jest.unmock('@/services/fms/fms.service');

import crypto from 'crypto';
import { FMSService } from '@/services/fms/fms.service';
import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSProviderType, FMSAuthType, FMSSyncStatus } from '@/types/fms.types';

const facilityId = '550e8400-e29b-41d4-a716-446655440011';
const webhookSecret = 'test-webhook-secret';

function signBody(raw: Buffer): string {
  return crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
}

function tenantUpdatedEnvelope(eventId: string) {
  return {
    id: eventId,
    type: 'com.storedge.tenant.updated.v1',
    body: {
      facility_id: 'ext-fac',
      tenant_id: 'tenant-ext-1',
      email: 'tenant@example.com',
      first_name: 'Test',
      last_name: 'Tenant',
    },
  };
}

describe('FMSService.handleWebhookEvent idempotency', () => {
  const findByExternalEventId = jest.fn();
  const deleteByExternalEventId = jest.fn();
  const createWebhookRecord = jest.fn();
  const markProcessed = jest.fn();
  const findByFacilityId = jest.fn();
  const syncLogCreate = jest.fn();
  const syncLogUpdate = jest.fn();
  const syncLogMarkCompleted = jest.fn();
  const changeCreate = jest.fn();
  const findByExternalId = jest.fn();
  const findOpenWebhookReviewSyncLog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (FMSService as unknown as { instance?: unknown }).instance = undefined;

    findByFacilityId.mockResolvedValue({
      id: 'cfg-1',
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
        syncSettings: { autoAcceptChanges: false, webhookSecret },
        customSettings: { facilityId: 'ext-fac' },
      },
    });

    findByExternalEventId.mockResolvedValue(null);
    createWebhookRecord.mockImplementation(async (data: { external_event_id: string }) => ({
      id: 'wh-1',
      facility_id: facilityId,
      external_event_id: data.external_event_id,
      event_type: 'tenant.updated',
      received_at: new Date(),
      processed_at: null,
      sync_log_id: 'sync-1',
    }));
    syncLogCreate.mockResolvedValue({ id: 'sync-1' });
    findByExternalId.mockResolvedValue(null);
    findOpenWebhookReviewSyncLog.mockResolvedValue(null);
    changeCreate.mockImplementation(async (insert: { external_id: string }) => ({
      id: 'change-1',
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
      isProcessed: (record: { processed_at?: Date | null }) => record.processed_at != null,
    };
    (svc as unknown as { syncLogModel: Record<string, jest.Mock> }).syncLogModel = {
      create: syncLogCreate,
      update: syncLogUpdate,
      markCompleted: syncLogMarkCompleted,
      findOpenWebhookReviewSyncLog,
    };
    (svc as unknown as { changeModel: { create: typeof changeCreate } }).changeModel = {
      create: changeCreate,
    };
    (svc as unknown as { entityMappingModel: { findByExternalId: typeof findByExternalId } }).entityMappingModel = {
      findByExternalId,
    };
    (svc as unknown as { broadcastFMSSyncUpdate: jest.Mock }).broadcastFMSSyncUpdate = jest.fn();
  });

  it('returns duplicate only for successfully processed events', async () => {
    findByExternalEventId.mockResolvedValue({
      id: 'wh-old',
      facility_id: facilityId,
      external_event_id: 'evt-done',
      event_type: 'tenant.updated',
      received_at: new Date(),
      processed_at: new Date(),
      sync_log_id: 'sync-old',
    });

    const raw = Buffer.from(JSON.stringify(tenantUpdatedEnvelope('evt-done')));
    const result = await FMSService.getInstance().handleWebhookEvent(
      facilityId,
      raw,
      signBody(raw)
    );

    expect(result.duplicate).toBe(true);
    expect(syncLogCreate).not.toHaveBeenCalled();
  });

  it('deletes failed in-flight record and retries processing', async () => {
    findByExternalEventId.mockResolvedValue({
      id: 'wh-stale',
      facility_id: facilityId,
      external_event_id: 'evt-retry',
      event_type: 'tenant.updated',
      received_at: new Date(),
      processed_at: null,
      sync_log_id: 'sync-stale',
    });

    const raw = Buffer.from(JSON.stringify(tenantUpdatedEnvelope('evt-retry')));
    const result = await FMSService.getInstance().handleWebhookEvent(
      facilityId,
      raw,
      signBody(raw)
    );

    expect(deleteByExternalEventId).toHaveBeenCalledWith(facilityId, 'evt-retry');
    expect(result.duplicate).toBe(false);
    expect(markProcessed).toHaveBeenCalled();
  });

  it('removes webhook record when processing throws so Storable can retry', async () => {
    changeCreate.mockRejectedValueOnce(new Error('DB unavailable'));

    const raw = Buffer.from(JSON.stringify(tenantUpdatedEnvelope('evt-fail')));
    await expect(
      FMSService.getInstance().handleWebhookEvent(facilityId, raw, signBody(raw))
    ).rejects.toThrow('DB unavailable');

    expect(deleteByExternalEventId).toHaveBeenCalledWith(facilityId, 'evt-fail');
    expect(syncLogUpdate).toHaveBeenCalledWith(
      'sync-1',
      expect.objectContaining({ sync_status: FMSSyncStatus.FAILED })
    );
    expect(markProcessed).not.toHaveBeenCalled();
  });
});
