import request from 'supertest';
import { createApp } from '@/app';
import { AuthService } from '@/services/auth.service';
import {
  createMockTestData,
  expectForbidden,
  expectUnauthorized,
  expectSuccess,
  expectBadRequest,
} from '@/__tests__/utils/mock-test-helpers';

const mockGetCodesForUser = jest.fn().mockResolvedValue([]);
const mockGetAppCodesForUser = jest.fn().mockResolvedValue([]);
const mockGetConfig = jest.fn().mockResolvedValue({
  facility_id: '550e8400-e29b-41d4-a716-446655440001',
  is_enabled: true,
  digit_count: 6,
  rotation_interval_hours: 24,
  rotation_hour: 0,
  rotation_minute: 0,
});
const mockUpsertConfig = jest.fn().mockResolvedValue({
  facility_id: '550e8400-e29b-41d4-a716-446655440001',
  is_enabled: true,
  digit_count: 6,
  rotation_interval_hours: 24,
  rotation_hour: 0,
  rotation_minute: 0,
});
const mockGetActiveCodesForFacility = jest.fn().mockResolvedValue([]);
const mockGetEffectiveCodesForFacility = jest.fn().mockResolvedValue([]);
const mockForceRotate = jest.fn().mockResolvedValue(undefined);
const mockSetManualCode = jest.fn().mockResolvedValue(undefined);
const mockPushCodesToGateway = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn().mockReturnValue({
      getCodesForUser: (...args: unknown[]) => mockGetCodesForUser(...args),
      getAppCodesForUser: (...args: unknown[]) => mockGetAppCodesForUser(...args),
      getConfig: (...args: unknown[]) => mockGetConfig(...args),
      upsertConfig: (...args: unknown[]) => mockUpsertConfig(...args),
      getActiveCodesForFacility: (...args: unknown[]) => mockGetActiveCodesForFacility(...args),
      getEffectiveCodesForFacility: (...args: unknown[]) => mockGetEffectiveCodesForFacility(...args),
      forceRotate: (...args: unknown[]) => mockForceRotate(...args),
      setManualCode: (...args: unknown[]) => mockSetManualCode(...args),
      pushCodesToGateway: (...args: unknown[]) => mockPushCodesToGateway(...args),
    }),
  },
}));

describe('Access Codes Routes', () => {
  const app = createApp();
  let testData: ReturnType<typeof createMockTestData>;

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  it('requires auth for /my', async () => {
    const response = await request(app).get('/api/v1/access-codes/my');
    expectUnauthorized(response);
  });

  it('allows authenticated user on /my', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes/my')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);
    expectSuccess(response);
  });

  it('includes device_type for each entry on /my', async () => {
    mockGetCodesForUser.mockResolvedValueOnce([
      {
        device_id: 'dev-1',
        device_name: 'Front Gate',
        device_type: 'gate',
        location_description: 'Main entrance',
        code: '123456',
        valid_from: '2026-03-09T00:00:00.000Z',
        valid_until: '2026-03-10T00:00:00.000Z',
      },
    ]);

    const response = await request(app)
      .get('/api/v1/access-codes/my')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);

    expectSuccess(response);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]).toEqual(expect.objectContaining({
      device_id: 'dev-1',
      device_type: 'gate',
    }));
  });

  it('allows tenant on /app/my and forwards to app-scope service method', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes/app/my')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);
    expectSuccess(response);
    expect(mockGetAppCodesForUser).toHaveBeenCalled();
  });

  it('includes device_type for each entry on /app/my', async () => {
    mockGetAppCodesForUser.mockResolvedValueOnce([
      {
        device_id: 'dev-2',
        device_name: 'Elevator 1',
        device_type: 'elevator',
        location_description: 'Lobby',
        code: '654321',
        valid_from: '2026-03-09T00:00:00.000Z',
        valid_until: '2026-03-10T00:00:00.000Z',
      },
    ]);

    const response = await request(app)
      .get('/api/v1/access-codes/app/my')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);

    expectSuccess(response);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]).toEqual(expect.objectContaining({
      device_id: 'dev-2',
      device_type: 'elevator',
    }));
  });

  it('forbids unsupported role on /app/my', async () => {
    const unsupportedRoleToken = AuthService.generateToken({
      id: 'viewer-1',
      email: 'viewer@test.com',
      password_hash: 'hashed-password',
      first_name: 'View',
      last_name: 'Only',
      role: 'viewer' as any,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const response = await request(app)
      .get('/api/v1/access-codes/app/my')
      .set('Authorization', `Bearer ${unsupportedRoleToken}`);
    expectForbidden(response);
  });

  it('forwards optional facility_id on /app/my', async () => {
    await request(app)
      .get('/api/v1/access-codes/app/my')
      .query({ facility_id: '550e8400-e29b-41d4-a716-446655440001' })
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(mockGetAppCodesForUser).toHaveBeenCalledWith(
      expect.any(String),
      'facility_admin',
      expect.any(Array),
      '550e8400-e29b-41d4-a716-446655440001',
    );
  });

  it('blocks tenant from admin endpoints', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes')
      .query({ facility_id: '550e8400-e29b-41d4-a716-446655440001' })
      .set('Authorization', `Bearer ${testData.users.tenant.token}`);
    expectForbidden(response);
  });

  it('returns effective code list for admins with facility scope', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes/effective')
      .query({ facility_id: '550e8400-e29b-41d4-a716-446655440001' })
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .expect(200);

    expectSuccess(response);
  });

  it('requires facility_id for effective endpoint', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes/effective')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);
    expectBadRequest(response);
  });

  it('blocks facility admin from effective endpoint outside assigned facility', async () => {
    const response = await request(app)
      .get('/api/v1/access-codes/effective')
      .query({ facility_id: '550e8400-e29b-41d4-a716-446655440002' })
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);
    expectForbidden(response);
  });

  it('validates rotate payload bounds', async () => {
    const response = await request(app)
      .post('/api/v1/access-codes/rotate')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({ facility_id: 'not-a-uuid' });
    expectBadRequest(response);
  });

  it('rejects rotate payload when scope_id is missing for device scope', async () => {
    const response = await request(app)
      .post('/api/v1/access-codes/rotate')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device',
      });
    expectBadRequest(response);
    expect(mockForceRotate).not.toHaveBeenCalled();
  });

  it('rejects manual set when scope_id is missing for group scope', async () => {
    const response = await request(app)
      .put('/api/v1/access-codes/manual/set')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device_group',
        code: '123456',
      });
    expectBadRequest(response);
    expect(mockSetManualCode).not.toHaveBeenCalled();
  });

  it('accepts scoped rotate and forwards scope args to service', async () => {
    await request(app)
      .post('/api/v1/access-codes/rotate')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device_group',
        scope_id: '550e8400-e29b-41d4-a716-446655440101',
      })
      .expect(200);

    expect(mockForceRotate).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'device_group',
      '550e8400-e29b-41d4-a716-446655440101',
      expect.any(String),
      undefined,
    );
  });

  it('accepts schedule-scoped rotate for group and forwards schedule_id', async () => {
    await request(app)
      .post('/api/v1/access-codes/rotate')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device_group',
        scope_id: '550e8400-e29b-41d4-a716-446655440101',
        schedule_id: '550e8400-e29b-41d4-a716-446655441001',
      })
      .expect(200);

    expect(mockForceRotate).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'device_group',
      '550e8400-e29b-41d4-a716-446655440101',
      expect.any(String),
      '550e8400-e29b-41d4-a716-446655441001',
    );
  });

  it('rejects schedule-scoped rotate for device scope', async () => {
    const response = await request(app)
      .post('/api/v1/access-codes/rotate')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device',
        scope_id: '550e8400-e29b-41d4-a716-446655440201',
        schedule_id: '550e8400-e29b-41d4-a716-446655441001',
      });
    expectBadRequest(response);
    expect(mockForceRotate).not.toHaveBeenCalled();
  });

  it('accepts scoped manual set and forwards args to service', async () => {
    await request(app)
      .put('/api/v1/access-codes/manual/set')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device',
        scope_id: '550e8400-e29b-41d4-a716-446655440201',
        code: '123456',
      })
      .expect(200);

    expect(mockSetManualCode).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'device',
      '550e8400-e29b-41d4-a716-446655440201',
      '123456',
      expect.any(String),
      undefined,
    );
  });

  it('accepts schedule-scoped manual set for group and forwards schedule_id', async () => {
    await request(app)
      .put('/api/v1/access-codes/manual/set')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        scope_type: 'device_group',
        scope_id: '550e8400-e29b-41d4-a716-446655440101',
        schedule_id: '550e8400-e29b-41d4-a716-446655441001',
        code: '654321',
      })
      .expect(200);

    expect(mockSetManualCode).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'device_group',
      '550e8400-e29b-41d4-a716-446655440101',
      '654321',
      expect.any(String),
      '550e8400-e29b-41d4-a716-446655441001',
    );
  });

  it('accepts fractional rotation interval updates', async () => {
    await request(app)
      .put('/api/v1/access-codes/config/550e8400-e29b-41d4-a716-446655440001')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({ rotation_interval_hours: 0.0008 })
      .expect(200);

    expect(mockUpsertConfig).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      expect.objectContaining({ rotation_interval_hours: 0.0008 }),
    );
  });

  it('allows facility admin in their facility', async () => {
    const response = await request(app)
      .put('/api/v1/access-codes/config/550e8400-e29b-41d4-a716-446655440001')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ digit_count: 7 })
      .expect(200);
    expectSuccess(response);
  });
});

