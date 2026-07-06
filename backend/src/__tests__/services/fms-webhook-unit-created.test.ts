/** FMSService unit.created webhook resolution */
jest.unmock('@/services/fms/fms.service');

import crypto from 'crypto';
import { FMSService } from '@/services/fms/fms.service';
import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSProviderType, FMSAuthType, FMSChangeType } from '@/types/fms.types';

const facilityId = '550e8400-e29b-41d4-a716-446655440011';
const webhookSecret = 'test-webhook-secret';

function signBody(raw: Buffer): string {
  return crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
}

function webhookHeaders(raw: Buffer): Record<string, string> {
  return { 'X-Storable-Signature': signBody(raw) };
}

function unitCreatedEnvelope(eventId: string, unitId: string) {
  return {
    id: eventId,
    type: 'com.storedge.unit.created.v1',
    body: {
      facility_id: 'ext-fac',
      unit_id: unitId,
    },
  };
}

describe('FMSService unit.created webhook', () => {
  const findByExternalEventId = jest.fn();
  const deleteByExternalEventId = jest.fn();
  const createWebhookRecord = jest.fn();
  const markProcessed = jest.fn();
  const findByFacilityId = jest.fn();
  const syncLogCreate = jest.fn();
  const syncLogUpdate = jest.fn();
  const syncLogMarkCompleted = jest.fn();
  const syncLogMarkPendingReview = jest.fn();
  const changeCreate = jest.fn();
  const findByExternalId = jest.fn();
  const findOpenWebhookReviewSyncLog = jest.fn();
  let fetchUnitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (FMSService as unknown as { instance?: unknown }).instance = undefined;

    fetchUnitSpy = jest.spyOn(StoredgeProvider.prototype, 'fetchUnit');

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
      event_type: 'unit.created',
      received_at: new Date(),
      processed_at: null,
      sync_log_id: 'sync-1',
    }));
    syncLogCreate.mockResolvedValue({ id: 'sync-1', changes_detected: 0, changes_pending: 0 });
    findByExternalId.mockResolvedValue(null);
    findOpenWebhookReviewSyncLog.mockResolvedValue(null);
    changeCreate.mockImplementation(async (insert: Record<string, unknown>) => ({
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
    (svc as unknown as { getFacilityName: jest.Mock }).getFacilityName = jest.fn().mockResolvedValue('Test Facility');
    (svc as unknown as { notifyFmsWebhookReceived: jest.Mock }).notifyFmsWebhookReceived = jest.fn();
  });

  afterEach(() => {
    fetchUnitSpy.mockRestore();
    jest.useRealTimers();
  });

  it('marks change invalid when Storedge unit cannot be fetched from FMS API', async () => {
    fetchUnitSpy.mockResolvedValue(null);
    const envelope = unitCreatedEnvelope('evt-unit-invalid', 'unit-demo-001');
    const raw = Buffer.from(JSON.stringify(envelope));

    const promise = FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));
    await jest.runAllTimersAsync();
    await promise;

    expect(fetchUnitSpy).toHaveBeenCalledTimes(3);
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_ADDED,
        external_id: 'unit-demo-001',
        is_valid: false,
        validation_errors: [
          expect.stringContaining('Could not fetch unit unit-demo-001 from FMS API'),
        ],
      }),
    );
  });

  it('creates valid change when unit is fetched from FMS API', async () => {
    fetchUnitSpy.mockResolvedValue({
      externalId: 'real-unit-uuid',
      unitNumber: 'B-205',
      unitType: 'storage',
      status: 'available',
    });
    const envelope = unitCreatedEnvelope('evt-unit-valid', 'real-unit-uuid');
    const raw = Buffer.from(JSON.stringify(envelope));

    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_ADDED,
        external_id: 'real-unit-uuid',
        is_valid: true,
        after_data: expect.objectContaining({ unitNumber: 'B-205' }),
      }),
    );
  });
});
