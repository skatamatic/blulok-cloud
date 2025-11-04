import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { decodeProtectedHeader } from 'jose';

// Mock DatabaseService connection used by route
jest.mock('@/services/database.service');

// Helper to create a minimal knex-like query builder mock
const createMockDbConnection = (userDeviceRow: any, lockRows: any[]) => {
  return jest.fn((table: string) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      first: jest.fn(),
      then: jest.fn((onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled([]);
        return Promise.resolve([]);
      }),
    };

    if (table === 'user_devices') {
      qb.first.mockResolvedValue(userDeviceRow);
      return qb;
    }
    if (table === 'blulok_devices' || table.startsWith('blulok_devices')) {
      qb.then = (onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled(lockRows);
        return Promise.resolve(lockRows);
      };
      qb.first.mockResolvedValue(lockRows[0] || null);
      return qb;
    }
    return qb;
  });
};

describe('Route Pass Integration', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    (DatabaseService.getInstance as jest.Mock).mockClear();
  });

  it('issues a signed route pass including device public key and audiences', async () => {
    // Base64url for 'public'
    const devicePublicKeyB64 = 'cHVibGlj';

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: createMockDbConnection(
        { id: 'dev-1', user_id: testData.users.tenant.id, app_device_id: 'phone-1', status: 'active', public_key: devicePublicKeyB64 },
        [{ id: 'lock-1' }, { id: 'lock-2' }]
      ),
    });

    const res = await request(app)
      .post('/api/v1/passes/request')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .set('X-App-Device-Id', 'phone-1')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.routePass).toBe('string');

    // Verify signature and claims using ops public key via service
    const payload = await Ed25519Service.verifyJwt(res.body.routePass);
    expect(payload.sub).toBe(testData.users.tenant.id);
    expect(payload.device_pubkey).toBe(devicePublicKeyB64);
    expect(Array.isArray(payload.aud)).toBe(true);
    expect(payload.aud).toEqual(['lock:lock-1', 'lock:lock-2']);

    // Verify protected header uses EdDSA
    const header = decodeProtectedHeader(res.body.routePass);
    expect(header.alg).toBe('EdDSA');
    expect(header.typ).toBe('JWT');
  });
});


