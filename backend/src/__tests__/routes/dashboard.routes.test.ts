import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';
import { UserRole } from '@/types/auth.types';
import { AccessDeniedError } from '@/middleware/error.middleware';

const mockGetScopedStats = jest.fn();
const mockCanSubscribe = jest.fn();

jest.mock('@/services/general-stats.service', () => ({
  GeneralStatsService: {
    getInstance: jest.fn(() => ({
      getScopedStats: (...args: unknown[]) => mockGetScopedStats(...args),
      canSubscribeToGeneralStats: (role: UserRole) => mockCanSubscribe(role),
    })),
  },
}));

const mockStatsPayload = {
  facilities: { total: 2, active: 2, inactive: 0, maintenance: 0 },
  devices: { total: 10, online: 8, offline: 2, error: 0, maintenance: 0 },
  users: {
    total: 5,
    active: 5,
    inactive: 0,
    byRole: {
      [UserRole.TENANT]: 2,
      [UserRole.FACILITY_ADMIN]: 1,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 0,
      [UserRole.ADMIN]: 1,
      [UserRole.DEV_ADMIN]: 1,
    },
  },
  alerts: { open: 0 },
  lastUpdated: '2026-01-01T00:00:00.000Z',
  scope: { type: 'all' as const },
};

describe('Dashboard routes', () => {
  let app: ReturnType<typeof createApp>;
  const testData = createMockTestData();

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanSubscribe.mockImplementation((role: UserRole) =>
      [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN, UserRole.MAINTENANCE].includes(role)
    );
    mockGetScopedStats.mockResolvedValue(mockStatsPayload);
  });

  describe('GET /api/v1/dashboard/general-stats', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/dashboard/general-stats');
      expectUnauthorized(res);
    });

    it('returns 403 for roles that cannot subscribe to general stats', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/general-stats')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(res);
      expect(res.body.success).toBe(false);
      expect(String(res.body.message)).toMatch(/Insufficient permissions/i);
      expect(mockGetScopedStats).not.toHaveBeenCalled();
    });

    it('returns scoped stats for admin without facility_id', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/general-stats')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject(mockStatsPayload);
      expect(mockGetScopedStats).toHaveBeenCalledWith(
        testData.users.admin.id,
        UserRole.ADMIN,
        undefined
      );
    });

    it('passes facility_id to getScopedStats when query is valid', async () => {
      const fid = '550e8400-e29b-41d4-a716-446655440001';
      const res = await request(app)
        .get(`/api/v1/dashboard/general-stats?facility_id=${fid}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockGetScopedStats).toHaveBeenCalledWith(testData.users.admin.id, UserRole.ADMIN, {
        facilityId: fid,
      });
    });

    it('returns 400 for invalid facility_id (non-UUID)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/general-stats?facility_id=not-a-uuid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(res);
      expect(mockGetScopedStats).not.toHaveBeenCalled();
    });

    it('returns 403 when getScopedStats throws AccessDeniedError (facility not allowed)', async () => {
      mockGetScopedStats.mockRejectedValueOnce(new AccessDeniedError('Not allowed to view statistics for this facility'));

      const res = await request(app)
        .get('/api/v1/dashboard/general-stats?facility_id=550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectForbidden(res);
    });

    it('allows maintenance user', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/general-stats')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockGetScopedStats).toHaveBeenCalledWith(
        testData.users.maintenance.id,
        UserRole.MAINTENANCE,
        undefined
      );
    });
  });
});
