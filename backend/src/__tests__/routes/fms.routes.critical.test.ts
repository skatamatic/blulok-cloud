/**
 * FMS HTTP contract tests (validation + pending-change enrichment) on the full app.
 * RBAC matrix lives in security/fms-rbac.test.ts — this file focuses on request/response shapes.
 */

import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess } from '@/__tests__/utils/mock-test-helpers';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSService } from '@/services/fms/fms.service';
import { FMSProviderType } from '@/types/fms.types';
import { ConflictError } from '@/middleware/error.middleware';

describe('FMS routes — critical paths', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  const facility1 = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
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
  });

  describe('GET /api/v1/fms/changes/:syncLogId/pending', () => {
    let syncLogFactory: ReturnType<jest.Mock['getMockImplementation']>;

    beforeEach(() => {
      syncLogFactory = (FMSSyncLogModel as jest.Mock).getMockImplementation();
      (FMSSyncLogModel as jest.Mock).mockImplementation(() => ({
        findById: jest.fn().mockResolvedValue({
          id: 'sync-log-derive',
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
        }),
        findByFacilityId: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
        create: jest.fn(),
        update: jest.fn(),
        markCompleted: jest.fn(),
        markFailed: jest.fn(),
      }));
    });

    afterEach(() => {
      if (syncLogFactory) {
        (FMSSyncLogModel as jest.Mock).mockImplementation(syncLogFactory);
      }
      const fms = FMSService.getInstance() as unknown as { getPendingChanges: jest.Mock };
      fms.getPendingChanges.mockResolvedValue([]);
    });

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
      expect(ch.validation_errors.some((e: string) => /email/i.test(e))).toBe(true);
      expect(ch.validation_errors.some((e: string) => /first name/i.test(e))).toBe(true);
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
  });
});
