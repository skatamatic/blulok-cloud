/** FMSService ledger move-in/out webhooks emit companion unit_updated for occupancy parity with full sync */
jest.unmock('@/services/fms/fms.service');

import crypto from 'crypto';
import { FMSService } from '@/services/fms/fms.service';
import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSProviderType, FMSAuthType, FMSChangeType } from '@/types/fms.types';

const facilityId = '550e8400-e29b-41d4-a716-446655440022';
const webhookSecret = 'test-webhook-secret-occ';

function signBody(raw: Buffer): string {
  return crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
}

function webhookHeaders(raw: Buffer): Record<string, string> {
  return { 'X-Storable-Signature': signBody(raw) };
}

function ledgerEnvelope(
  eventId: string,
  type: 'com.storedge.ledger.moved-out.v1' | 'com.storedge.ledger.moved-in.v1',
  tenantId: string,
  unitId: string,
) {
  return {
    id: eventId,
    type,
    body: {
      facility_id: 'ext-fac',
      tenant_id: tenantId,
      unit_id: unitId,
    },
  };
}

describe('FMSService ledger webhook occupancy companion unit_updated', () => {
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
  const unitFindById = jest.fn();
  let fetchUnitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
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
      event_type: 'ledger.moved-out',
      received_at: new Date(),
      processed_at: null,
      sync_log_id: 'sync-1',
    }));
    syncLogCreate.mockResolvedValue({ id: 'sync-1', changes_detected: 0, changes_pending: 0 });
    findOpenWebhookReviewSyncLog.mockResolvedValue(null);
    changeCreate.mockImplementation(async (insert: Record<string, unknown>) => ({
      id: `change-${changeCreate.mock.calls.length + 1}`,
      ...insert,
    }));

    findByExternalId.mockImplementation((_fac: string, entityType: string, externalId: string) => {
      if (entityType === 'user') {
        return Promise.resolve({ id: 'map-t', internal_id: 'tenant-1', external_id: externalId });
      }
      if (entityType === 'unit') {
        return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: externalId });
      }
      return Promise.resolve(null);
    });

    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '101',
      status: 'occupied',
      unit_type: 'Small',
    });

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
    (svc as unknown as { unitModel: { findById: typeof unitFindById } }).unitModel = {
      findById: unitFindById,
    };
    (svc as unknown as { broadcastFMSSyncUpdate: jest.Mock }).broadcastFMSSyncUpdate = jest.fn();
    (svc as unknown as { getFacilityName: jest.Mock }).getFacilityName = jest.fn().mockResolvedValue('Test Facility');
    (svc as unknown as { notifyFmsWebhookReceived: jest.Mock }).notifyFmsWebhookReceived = jest.fn();
  });

  afterEach(() => {
    fetchUnitSpy.mockRestore();
  });

  it('moved-out emits tenant_unit_changed plus unit_updated when FMS unit is vacant', async () => {
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '101',
      unitType: 'Small',
      status: 'available',
      tenantId: undefined,
    });

    const envelope = ledgerEnvelope(
      'evt-move-out',
      'com.storedge.ledger.moved-out.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(fetchUnitSpy).toHaveBeenCalledWith('ext-unit');
    expect(changeCreate).toHaveBeenCalledTimes(2);
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        before_data: expect.objectContaining({ action: 'unassign_unit' }),
        // Must be null so apply/order resolve the unassign action instead of no-oping
        after_data: null,
        is_valid: true,
      }),
    );
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_UPDATED,
        internal_id: 'unit-1',
        after_data: expect.objectContaining({ status: 'available' }),
        before_data: expect.objectContaining({ status: 'occupied' }),
      }),
    );
  });

  it('moved-in emits companion unit_updated when BluLok unit is still available', async () => {
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '101',
      status: 'available',
      unit_type: 'Small',
    });
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '101',
      unitType: 'Small',
      status: 'occupied',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-in',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        after_data: expect.objectContaining({ action: 'assign_unit' }),
      }),
    );
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_UPDATED,
        external_id: 'ext-unit',
        after_data: expect.objectContaining({ status: 'occupied', tenantId: 'ext-tenant' }),
        is_valid: true,
      }),
    );
  });

  it('fills companion external_id from the webhook unit_id when fetch omits it', async () => {
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '101',
      status: 'available',
      unit_type: 'Small',
    });
    fetchUnitSpy.mockResolvedValue({
      unitNumber: '101',
      unitType: 'Small',
      status: 'occupied',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-in-no-ext',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_UPDATED,
        external_id: 'ext-unit',
        after_data: expect.objectContaining({ externalId: 'ext-unit', status: 'occupied' }),
        impact_summary: expect.stringContaining('101'),
      }),
    );
  });

  it('skips a garbage companion unit_updated and still records the assign', async () => {
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '101',
      status: 'occupied',
      unit_type: 'Wine Storage',
    });
    fetchUnitSpy.mockResolvedValue({ unitType: '' });

    const envelope = ledgerEnvelope(
      'evt-move-in-garbage-unit',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledTimes(1);
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ change_type: FMSChangeType.TENANT_UNIT_CHANGED }),
    );
    expect(changeCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ change_type: FMSChangeType.UNIT_UPDATED }),
    );
  });

  it('blocks move-in assign when FMS unit status is vacant (unit status is SoT)', async () => {
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '101',
      status: 'available',
      unit_type: 'Small',
    });
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '101',
      unitType: 'Small',
      status: 'available',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-in-vacant',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        is_valid: false,
        validation_errors: [expect.stringContaining('source of truth')],
      }),
    );
    // Both sides already available — no companion unit_updated needed
    expect(changeCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ change_type: FMSChangeType.UNIT_UPDATED }),
    );
  });

  it('allows the companion unit_updated when the moving-in tenant will be a placeholder', async () => {
    findByExternalId.mockImplementation((_fac: string, entityType: string, externalId: string) => {
      if (entityType === 'unit') {
        return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: externalId });
      }
      return Promise.resolve(null);
    });
    jest.spyOn(StoredgeProvider.prototype, 'fetchTenant').mockResolvedValue({
      externalId: 'ext-tenant',
      email: null,
      phone: undefined,
      firstName: 'Lucien',
      lastName: 'Robel',
      unitIds: ['ext-unit'],
      status: 'active',
    });
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '908',
      status: 'available',
      unit_type: 'Small',
    });
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '908',
      unitType: 'Small',
      status: 'occupied',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-in-blocked',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_UPDATED,
        is_valid: true,
      }),
    );
  });

  it('skips the companion unit_updated when the moving-in tenant is already an invalid tenant_added', async () => {
    findByExternalId.mockImplementation((_fac: string, entityType: string, externalId: string) => {
      if (entityType === 'unit') {
        return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: externalId });
      }
      return Promise.resolve(null);
    });
    jest.spyOn(StoredgeProvider.prototype, 'fetchTenant').mockResolvedValue({
      externalId: 'ext-tenant',
      email: null,
      phone: undefined,
      firstName: '',
      lastName: '',
      unitIds: ['ext-unit'],
      status: 'active',
    });
    unitFindById.mockResolvedValue({
      id: 'unit-1',
      facility_id: facilityId,
      unit_number: '908',
      status: 'available',
      unit_type: 'Small',
    });
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '908',
      unitType: 'Small',
      status: 'occupied',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-in-nameless',
      'com.storedge.ledger.moved-in.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_ADDED,
        is_valid: false,
      }),
    );
    expect(changeCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.UNIT_UPDATED,
      }),
    );
  });

  it('skips companion unit_updated when FMS status already matches BluLok', async () => {
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '101',
      unitType: 'Small',
      status: 'occupied',
      tenantId: 'ext-tenant',
    });

    const envelope = ledgerEnvelope(
      'evt-move-out-same',
      'com.storedge.ledger.moved-out.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledTimes(1);
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ change_type: FMSChangeType.TENANT_UNIT_CHANGED }),
    );
  });

  it('marks move-out for an unmapped unit invalid instead of failing at apply', async () => {
    findByExternalId.mockImplementation((_fac: string, entityType: string) => {
      if (entityType === 'user') {
        return Promise.resolve({ id: 'map-t', internal_id: 'tenant-1', external_id: 'ext-tenant' });
      }
      return Promise.resolve(null);
    });

    const envelope = ledgerEnvelope(
      'evt-move-out-unmapped',
      'com.storedge.ledger.moved-out.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(fetchUnitSpy).not.toHaveBeenCalled();
    expect(changeCreate).toHaveBeenCalledTimes(1);
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        is_valid: false,
        validation_errors: [expect.stringContaining('This unit is not mapped in BluLok yet')],
      }),
    );
  });

  it('marks move-out for an unmapped tenant invalid', async () => {
    findByExternalId.mockImplementation((_fac: string, entityType: string, externalId: string) => {
      if (entityType === 'unit') {
        return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: externalId });
      }
      return Promise.resolve(null);
    });
    fetchUnitSpy.mockResolvedValue({
      externalId: 'ext-unit',
      unitNumber: '101',
      unitType: 'Small',
      status: 'occupied',
    });

    const envelope = ledgerEnvelope(
      'evt-move-out-unmapped-tenant',
      'com.storedge.ledger.moved-out.v1',
      'ext-tenant',
      'ext-unit',
    );
    const raw = Buffer.from(JSON.stringify(envelope));
    await FMSService.getInstance().handleWebhookEvent(facilityId, raw, webhookHeaders(raw));

    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        is_valid: false,
        validation_errors: [expect.stringContaining('This tenant is not mapped in BluLok yet')],
      }),
    );
  });
});
