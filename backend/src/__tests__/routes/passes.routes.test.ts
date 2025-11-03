import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { RoutePassIssuanceModel } from '@/models/route-pass-issuance.model';

jest.mock('@/models/route-pass-issuance.model');

// Mock DatabaseService before any imports that might use it
const createMockDbConnection = (userDevices: any, lockRows: any[]) => {
  return jest.fn((table: string) => {
    const mockQueryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      first: jest.fn(),
      then: jest.fn((onFulfilled?: (rows: any[]) => any, _onRejected?: (e: any) => any) => {
        if (onFulfilled) onFulfilled([]);
        return Promise.resolve([]);
      }),
      catch: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      fn: { now: () => new Date() },
    };

    if (table === 'user_devices') {
      mockQueryBuilder.first.mockResolvedValue(userDevices);
      return mockQueryBuilder;
    }
    if (table === 'blulok_devices' || table.startsWith('blulok_devices')) {
      mockQueryBuilder.then = (onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled(lockRows);
        return Promise.resolve(lockRows);
      };
      mockQueryBuilder.first.mockResolvedValue(lockRows[0] || null);
      return mockQueryBuilder;
    }
    if (table === 'system_settings') {
      // Mock for TimeSyncService persistence
      mockQueryBuilder.first.mockResolvedValue(null);
      return mockQueryBuilder;
    }
    return mockQueryBuilder;
  });
};

jest.mock('@/services/database.service');

describe('Passes Routes', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    // Reset DB mock for each test
    (DatabaseService.getInstance as jest.Mock).mockClear();
  });

  describe('TENANT role', () => {
    it('returns route pass scoped to assigned units', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'cHVibGlj' },
          [{ id: 'lock-1' }, { id: 'lock-2' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.routePass).toBe('string');

      // Verify JWT payload contains correct audiences
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.sub).toBe(testData.users.tenant.id);
      expect(payload.device_pubkey).toBe('cHVibGlj');
      expect(Array.isArray(payload.aud)).toBe(true);
    });

    it('logs route pass issuance', async () => {
      const mockRoutePassModel = {
        create: jest.fn().mockResolvedValue({}),
      };
      (RoutePassIssuanceModel as jest.MockedClass<typeof RoutePassIssuanceModel>).mockImplementation(
        () => mockRoutePassModel as any
      );

      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { id: 'device-1', public_key: 'cHVibGlj' },
          [{ id: 'lock-1' }, { id: 'lock-2' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockRoutePassModel.create).toHaveBeenCalled();
      const callArgs = mockRoutePassModel.create.mock.calls[0][0];
      expect(callArgs.userId).toBe(testData.users.tenant.id);
      expect(callArgs.deviceId).toBe('device-1');
      expect(callArgs.audiences).toEqual(['lock:lock-1', 'lock:lock-2']);
      expect(callArgs.jti).toBeDefined();
      expect(callArgs.issuedAt).toBeInstanceOf(Date);
      expect(callArgs.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('ADMIN/DEV_ADMIN role', () => {
    it('returns route pass scoped to all locks', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'YWRtaW4=' },
          [{ id: 'lock-all-1' }, { id: 'lock-all-2' }, { id: 'lock-all-3' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.sub).toBe(testData.users.admin.id);
      expect(payload.aud).toEqual(['lock:lock-all-1', 'lock:lock-all-2', 'lock:lock-all-3']);
    });
  });

  describe('FACILITY_ADMIN role', () => {
    it('returns route pass scoped to locks in assigned facilities', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'ZmFjaWw=' },
          [{ id: 'lock-fac-1' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.aud).toEqual(['lock:lock-fac-1']);
    });
  });

  describe('Error cases', () => {
    it('returns 409 when no device is registered', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(null, []),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when X-App-Device-Id provided but device not found', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(null, []),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .set('X-App-Device-Id', 'unknown-device')
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unknown or unregistered device');
    });
  });
});


