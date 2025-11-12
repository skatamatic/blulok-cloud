import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { createMockTestData, expectUnauthorized, expectForbidden, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

jest.mock('@/services/database.service');
jest.mock('@/services/first-time-user.service', () => ({
  FirstTimeUserService: {
    getInstance: () => ({ sendInvite: jest.fn().mockResolvedValue(undefined) }),
  },
}));

// Minimal knex-like mock with table routing
const createMockKnex = (opts: {
  unitExists?: boolean;
  unitFacilityId?: string;
  isPrimaryTenant?: boolean;
  existingUserByPhone?: boolean;
  existingShare?: boolean;
} = {}) => {
  const state = {
    unit: opts.unitExists !== false ? { id: 'unit-1', facility_id: opts.unitFacilityId || 'facility-1' } : null,
    primary: opts.isPrimaryTenant === true ? { unit_id: 'unit-1', tenant_id: 'tenant-1', is_primary: true } : null,
    existingShare: opts.existingShare ? { id: 'share-1', unit_id: 'unit-1', shared_with_user_id: 'user-x' } : null,
    existingUser: opts.existingUserByPhone ? { id: 'user-x', phone_number: '+15551230000', role: 'tenant' } : null,
  };

  const qb = () => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockImplementation(function (data: any) {
      // emulate returning for Postgres
      if (Array.isArray(data)) return Promise.resolve([1]);
      return Promise.resolve([{ id: 'new-id', ...data }]);
    }),
    returning: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined),
    then: jest.fn((onFulfilled?: any) => Promise.resolve(onFulfilled ? onFulfilled([]) : [])),
  });

  const fn = jest.fn((table: string) => {
    const q = qb();
    if (table === 'units') {
      q.first = jest.fn().mockResolvedValue(state.unit);
      return q;
    }
    if (table === 'unit_assignments') {
      q.first = jest.fn().mockResolvedValue(state.primary);
      return q;
    }
    if (table === 'users') {
      q.first = jest.fn().mockResolvedValue(state.existingUser);
      q.insert = jest.fn().mockResolvedValue([1]);
      return q;
    }
    if (table === 'key_sharing') {
      // used by KeySharingModel.getUnitSharedKeys() and insert/update
      q.then = jest.fn((onFulfilled?: any) => Promise.resolve(onFulfilled ? onFulfilled(state.existingShare ? [state.existingShare] : []) : []));
      q.first = jest.fn().mockResolvedValue(state.existingShare);
      q.insert = jest.fn().mockResolvedValue([{ id: 'share-new' }]);
      q.update = jest.fn().mockResolvedValue(1);
      return q;
    }
    return q;
  });

  // convenience accessors
  (fn as any).where = jest.fn().mockReturnThis();
  (fn as any).first = jest.fn().mockResolvedValue(undefined);
  return fn;
};

describe('Key Sharing Invite Route', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    testData = createMockTestData();
    app = createApp();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/key-sharing/invite').send({});
    expectUnauthorized(res);
  });

  it('validates required fields', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex() });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({})
      .expect(400);
    expectBadRequest(res);
  });

  it('returns 404 when unit not found', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ unitExists: false }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ unit_id: 'missing', phone: '+15551234567' })
      .expect(404);
    expect(res.body.success).toBe(false);
  });

  it('TENANT must be primary to invite', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ isPrimaryTenant: false }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({ unit_id: 'unit-1', phone: '+15551234567' })
      .expect(403);
    expectForbidden(res);
  });

  it('TENANT primary can invite successfully (creates share)', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ isPrimaryTenant: true }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({ unit_id: 'unit-1', phone: '5551234567', access_level: 'limited' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.share_id).toBeDefined();
  });

  it('FACILITY_ADMIN cannot invite for units outside their facilities', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ unitFacilityId: 'facility-2' }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ unit_id: 'unit-1', phone: '+15551234567' })
      .expect(403);
    expectForbidden(res);
  });

  it('ADMIN can invite regardless of facility', async () => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ unitFacilityId: 'facility-999' }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ unit_id: 'unit-1', phone: '+15551234567', access_level: 'full' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('reactivates existing share idempotently', async () => {
    // Mock UserModel.findByPhone to return existing user
    const { UserModel } = await import('@/models/user.model');
    (UserModel.findByPhone as jest.Mock).mockResolvedValueOnce({ id: 'user-x', phone_number: '+15551230000', role: 'tenant' });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: createMockKnex({ isPrimaryTenant: true, existingShare: true, existingUserByPhone: true }) });
    const res = await request(app)
      .post('/api/v1/key-sharing/invite')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({ unit_id: 'unit-1', phone: '+15551230000', access_level: 'temporary' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.share_id).toBeDefined();
  });
});


