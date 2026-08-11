/**
 * FMS HTTP contract tests (validation + pending-change enrichment) on the full app.
 * RBAC matrix lives in security/fms-rbac.test.ts — this file focuses on request/response shapes.
 */

import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectForbidden } from '@/__tests__/utils/mock-test-helpers';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSService } from '@/services/fms/fms.service';
import { FMSProviderType } from '@/types/fms.types';
import { ConflictError } from '@/middleware/error.middleware';

describe('FMS routes — critical paths', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  const facility1 = '550e8400-e29b-41d4-a716-446655440001';
  const facility2 = '550e8400-e29b-41d4-a716-446655440002';
  const syncLogId = 'sync-log-1';

  const sampleConfig = {
    id: 'fms-config-1',
    facility_id: facility1,
    provider_type: FMSProviderType.GENERIC_REST,
    is_enabled: true,
    config: { features: { supportsWebhooks: true } },
    created_at: new Date(),
    updated_at: new Date(),
  };

  const sampleSyncLog = {
    id: syncLogId,
    facility_id: facility1,
    fms_config_id: 'fms-config-1',
    sync_status: 'pending_review',
    started_at: new Date(),
    triggered_by: 'manual',
    changes_detected: 1,
    changes_applied: 0,
    changes_pending: 1,
    changes_rejected: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  let syncLogFactory: ReturnType<jest.Mock['getMockImplementation']>;
  let configFactory: ReturnType<jest.Mock['getMockImplementation']>;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();

    syncLogFactory = (FMSSyncLogModel as jest.Mock).getMockImplementation();
    configFactory = (FMSConfigurationModel as jest.Mock).getMockImplementation();

    (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
      findById: jest.fn().mockResolvedValue(sampleSyncLog),
      findByFacilityId: jest.fn().mockResolvedValue({ logs: [sampleSyncLog], total: 1 }),
      create: jest.fn(),
      update: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    }));

    (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
      create: jest.fn().mockResolvedValue(sampleConfig),
      findById: jest.fn().mockResolvedValue(sampleConfig),
      findByFacilityId: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([sampleConfig]),
      findAllWithFacilities: jest.fn().mockResolvedValue([sampleConfig]),
      update: jest.fn().mockResolvedValue({ ...sampleConfig, is_enabled: false }),
      delete: jest.fn().mockResolvedValue(true),
      existsForFacility: jest.fn().mockResolvedValue(false),
    }));

    const fms = FMSService.getInstance() as unknown as Record<string, jest.Mock>;
    fms.testConnection = jest.fn().mockResolvedValue(true);
    fms.performSync = jest.fn().mockResolvedValue({
      success: true,
      syncLogId,
      changesDetected: [],
      summary: {
        tenantsAdded: 0,
        tenantsRemoved: 0,
        tenantsUpdated: 0,
        unitsAdded: 0,
        unitsRemoved: 0,
        unitsUpdated: 0,
        errors: [],
        warnings: [],
      },
      requiresReview: false,
    });
    fms.cancelSync = jest.fn().mockReturnValue(true);
    fms.getPendingChanges = jest.fn().mockResolvedValue([]);
    fms.reviewChanges = jest.fn().mockResolvedValue(undefined);
    fms.applyChanges = jest.fn().mockResolvedValue({
      success: true,
      changesApplied: 1,
      changesFailed: 0,
      errors: [],
      errorDetails: [],
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    });
    fms.dismissChanges = jest.fn().mockResolvedValue({ dismissed: 2 });
    fms.getRecentWebhookEvents = jest.fn().mockResolvedValue([
      { id: 'evt-1', event_type: 'tenant.updated', received_at: new Date().toISOString() },
    ]);
  });

  afterEach(() => {
    if (syncLogFactory) {
      (FMSSyncLogModel as jest.Mock).mockImplementation(syncLogFactory);
    }
    if (configFactory) {
      (FMSConfigurationModel as jest.Mock).mockImplementation(configFactory);
    }
  });

  describe('POST /api/v1/fms/config', () => {
    it('returns 400 when facility_id is missing', async () => {
      const response = await request(app)
        .post('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          provider_type: FMSProviderType.GENERIC_REST,
          config: { foo: 'bar' },
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toMatch(/facility_id/i);
    });

    it('returns 403 for facility_admin', async () => {
      const response = await request(app)
        .post('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: facility1,
          provider_type: FMSProviderType.GENERIC_REST,
          config: { foo: 'bar' },
        })
        .expect(403);

      expectForbidden(response);
    });

    it('creates config for admin', async () => {
      const response = await request(app)
        .post('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          facility_id: facility1,
          provider_type: FMSProviderType.GENERIC_REST,
          config: { apiUrl: 'https://example.test' },
          is_enabled: true,
        })
        .expect(201);

      expectSuccess(response);
      expect(response.body.config).toMatchObject({ id: 'fms-config-1' });
    });

    it('returns 409 when config already exists', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findByFacilityId: jest.fn().mockResolvedValue(sampleConfig),
        create: jest.fn(),
      }));

      const response = await request(app)
        .post('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          facility_id: facility1,
          provider_type: FMSProviderType.GENERIC_REST,
          config: { foo: 'bar' },
        })
        .expect(409);

      expect(response.body.message).toMatch(/already exists/i);
    });
  });

  describe('GET /api/v1/fms/config', () => {
    it('lists configs for admin', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.configs).toHaveLength(1);
    });

    it('filters webhooks_only', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config?webhooks_only=true')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.configs).toHaveLength(1);
    });

    it('lists configs for facility_admin (scoped)', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(Array.isArray(response.body.configs)).toBe(true);
    });

    it('returns 403 for tenant', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('GET /api/v1/fms/config/:facilityId', () => {
    it('returns config for admin', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findByFacilityId: jest.fn().mockResolvedValue(sampleConfig),
      }));

      const response = await request(app)
        .get(`/api/v1/fms/config/${facility1}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.config.id).toBe('fms-config-1');
    });

    it('returns 404 when missing', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findByFacilityId: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get(`/api/v1/fms/config/${facility1}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin accesses other facility', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/config/${facility2}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expect(response.body.message).toMatch(/Access denied/i);
    });
  });

  describe('PUT /api/v1/fms/config/:id', () => {
    it('updates config for admin', async () => {
      const response = await request(app)
        .put('/api/v1/fms/config/fms-config-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ is_enabled: false })
        .expect(200);

      expectSuccess(response);
      expect(response.body.config.is_enabled).toBe(false);
    });

    it('returns 404 when config missing', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      }));

      const response = await request(app)
        .put('/api/v1/fms/config/missing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ is_enabled: true })
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 for facility_admin', async () => {
      const response = await request(app)
        .put('/api/v1/fms/config/fms-config-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ is_enabled: false })
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('DELETE /api/v1/fms/config/:id', () => {
    it('deletes config for admin', async () => {
      const response = await request(app)
        .delete('/api/v1/fms/config/fms-config-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toMatch(/deleted/i);
    });

    it('returns 404 when missing', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      }));

      const response = await request(app)
        .delete('/api/v1/fms/config/missing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });
  });

  describe('POST /api/v1/fms/config/:id/test', () => {
    it('tests connection successfully', async () => {
      const response = await request(app)
        .post('/api/v1/fms/config/fms-config-1/test')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.body.connected).toBe(true);
    });

    it('returns 404 when config missing', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .post('/api/v1/fms/config/missing/test')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSConfigurationModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleConfig, facility_id: facility2 }),
      }));

      const response = await request(app)
        .post('/api/v1/fms/config/fms-config-1/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expect(response.body.message).toMatch(/Access denied/i);
    });

    it('returns 500 when testConnection throws', async () => {
      const fms = FMSService.getInstance() as unknown as { testConnection: jest.Mock };
      fms.testConnection.mockRejectedValueOnce(new Error('timeout'));

      const response = await request(app)
        .post('/api/v1/fms/config/fms-config-1/test')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(500);

      expect(response.body.message).toMatch(/Connection test failed/i);
    });
  });

  describe('POST /api/v1/fms/sync/:facilityId', () => {
    it('returns 409 when a sync is already running for the facility', async () => {
      const fms = FMSService.getInstance() as unknown as { performSync: jest.Mock };
      fms.performSync.mockRejectedValueOnce(
        new ConflictError('A sync operation is already running for this facility'),
      );

      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility1}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toMatch(/already running/i);
    });

    it('triggers sync for admin', async () => {
      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility1}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.result.success).toBe(true);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility2}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expect(response.body.message).toMatch(/Access denied/i);
    });
  });

  describe('POST /api/v1/fms/sync/:facilityId/cancel', () => {
    it('cancels active sync', async () => {
      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility1}/cancel`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.cancelled).toBe(true);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility2}/cancel`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('returns 500 when cancelSync throws', async () => {
      const fms = FMSService.getInstance() as unknown as { cancelSync: jest.Mock };
      fms.cancelSync.mockImplementationOnce(() => {
        throw new Error('cancel fail');
      });

      const response = await request(app)
        .post(`/api/v1/fms/sync/${facility1}/cancel`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(500);

      expect(response.body.message).toMatch(/Failed to cancel sync/i);
    });
  });

  describe('GET /api/v1/fms/sync/:facilityId/history', () => {
    it('returns sync history', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/sync/${facility1}/history?limit=10&offset=0`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.logs).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/sync/${facility2}/history`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('GET /api/v1/fms/webhooks/:facilityId/events', () => {
    it('returns recent webhook events', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/webhooks/${facility1}/events?limit=5`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.events).toHaveLength(1);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/webhooks/${facility2}/events`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('GET /api/v1/fms/sync/:syncLogId', () => {
    it('returns sync log details', async () => {
      const response = await request(app)
        .get(`/api/v1/fms/sync/${syncLogId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.syncLog.id).toBe(syncLogId);
    });

    it('returns 404 when missing', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/api/v1/fms/sync/missing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleSyncLog, facility_id: facility2 }),
      }));

      const response = await request(app)
        .get(`/api/v1/fms/sync/${syncLogId}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expect(response.body.message).toMatch(/Access denied/i);
    });
  });

  describe('GET /api/v1/fms/changes/:syncLogId/pending', () => {
    it('derives validation_errors for invalid tenant rows when missing', async () => {
      const fms = FMSService.getInstance() as unknown as { getPendingChanges: jest.Mock };
      fms.getPendingChanges.mockResolvedValue([
        {
          id: 'change-1',
          sync_log_id: 'sync-log-derive',
          change_type: 'tenant_added',
          entity_type: 'tenant',
          external_id: 'ext-1',
          after_data: {
            email: '',
            firstName: '',
            last_name: '',
          },
          required_actions: [],
          impact_summary: 'x',
          is_reviewed: false,
          is_valid: false,
          validation_errors: undefined,
          created_at: new Date(),
        },
      ]);

      const response = await request(app)
        .get('/api/v1/fms/changes/sync-log-derive/pending')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.changes).toHaveLength(1);
      const ch = response.body.changes[0];
      expect(Array.isArray(ch.validation_errors)).toBe(true);
      // Missing email+phone is allowed (placeholder tenant); names are still required.
      expect(ch.validation_errors.some((e: string) => /first name/i.test(e))).toBe(true);
      expect(ch.validation_errors.some((e: string) => /last name/i.test(e))).toBe(true);
    });

    it('returns 404 when sync log missing', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/api/v1/fms/changes/missing/pending')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleSyncLog, facility_id: facility2 }),
      }));

      const response = await request(app)
        .get(`/api/v1/fms/changes/${syncLogId}/pending`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/fms/changes/review', () => {
    it('accepts changes', async () => {
      const response = await request(app)
        .post('/api/v1/fms/changes/review')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId, changeIds: ['c1', 'c2'], accepted: true })
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toMatch(/accepted/i);
    });

    it('returns 400 when body invalid', async () => {
      const response = await request(app)
        .post('/api/v1/fms/changes/review')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('returns 404 when sync log missing', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .post('/api/v1/fms/changes/review')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId, changeIds: ['c1'], accepted: false })
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleSyncLog, facility_id: facility2 }),
      }));

      const response = await request(app)
        .post('/api/v1/fms/changes/review')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ syncLogId, changeIds: ['c1'], accepted: true })
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/fms/changes/apply', () => {
    it('applies accepted changes', async () => {
      const response = await request(app)
        .post('/api/v1/fms/changes/apply')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId, changeIds: ['c1'] })
        .expect(200);

      expectSuccess(response);
      expect(response.body.result.changesApplied).toBe(1);
    });

    it('returns 500 when applyChanges throws', async () => {
      const fms = FMSService.getInstance() as unknown as { applyChanges: jest.Mock };
      fms.applyChanges.mockRejectedValueOnce(new Error('apply fail'));

      const response = await request(app)
        .post('/api/v1/fms/changes/apply')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId, changeIds: ['c1'] })
        .expect(500);

      expect(response.body.message).toMatch(/Failed to apply changes/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleSyncLog, facility_id: facility2 }),
      }));

      const response = await request(app)
        .post('/api/v1/fms/changes/apply')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ syncLogId, changeIds: ['c1'] })
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/fms/changes/dismiss', () => {
    it('dismisses changes', async () => {
      const response = await request(app)
        .post('/api/v1/fms/changes/dismiss')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId, changeIds: ['c1'] })
        .expect(200);

      expectSuccess(response);
      expect(response.body.dismissed).toBe(2);
    });

    it('reports zero dismissible changes', async () => {
      const fms = FMSService.getInstance() as unknown as { dismissChanges: jest.Mock };
      fms.dismissChanges.mockResolvedValueOnce({ dismissed: 0 });

      const response = await request(app)
        .post('/api/v1/fms/changes/dismiss')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId })
        .expect(200);

      expect(response.body.message).toMatch(/No dismissible/i);
    });

    it('returns 404 when sync log missing', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .post('/api/v1/fms/changes/dismiss')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ syncLogId })
        .expect(404);

      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when facility_admin out of scope', async () => {
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({ ...sampleSyncLog, facility_id: facility2 }),
      }));

      const response = await request(app)
        .post('/api/v1/fms/changes/dismiss')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ syncLogId })
        .expect(403);

      expectForbidden(response);
    });
  });
});
