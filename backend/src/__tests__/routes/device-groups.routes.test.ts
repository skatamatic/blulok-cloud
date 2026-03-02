import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  expectForbidden,
  expectUnauthorized,
  expectSuccess,
  expectBadRequest,
} from '@/__tests__/utils/mock-test-helpers';
import { ConflictError } from '@/middleware/error.middleware';

const mockCreate = jest.fn().mockResolvedValue({
  id: 'grp-1',
  facility_id: '550e8400-e29b-41d4-a716-446655440001',
  is_global_shared: false,
  name: 'Main Zone',
});
const mockFindByFacility = jest.fn().mockResolvedValue([]);
const mockFindById = jest.fn().mockResolvedValue({
  id: 'grp-1',
  facility_id: '550e8400-e29b-41d4-a716-446655440001',
  is_global_shared: false,
  name: 'Main Zone',
});
const mockUpdate = jest.fn().mockResolvedValue({
  id: 'grp-1',
  facility_id: '550e8400-e29b-41d4-a716-446655440001',
  is_global_shared: false,
  name: 'Updated Zone',
});
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockAddMember = jest.fn().mockResolvedValue({ id: 'm-1', group_id: 'grp-1', device_id: 'dev-1' });
const mockRemoveMember = jest.fn().mockResolvedValue(undefined);
const mockGetMembers = jest.fn().mockResolvedValue([]);

jest.mock('@/services/device-group.service', () => ({
  DeviceGroupService: {
    getInstance: jest.fn().mockReturnValue({
      create: (...args: unknown[]) => mockCreate(...args),
      findByFacility: (...args: unknown[]) => mockFindByFacility(...args),
      findById: (...args: unknown[]) => mockFindById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      addMember: (...args: unknown[]) => mockAddMember(...args),
      removeMember: (...args: unknown[]) => mockRemoveMember(...args),
      getMembers: (...args: unknown[]) => mockGetMembers(...args),
    }),
  },
}));

describe('Device Groups Routes', () => {
  const app = createApp();
  let testData: ReturnType<typeof createMockTestData>;

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
    mockAddMember.mockResolvedValue({ id: 'm-1', group_id: 'grp-1', device_id: 'dev-1' });
  });

  it('requires auth', async () => {
    const response = await request(app).get('/api/v1/device-groups');
    expectUnauthorized(response);
  });

  it('denies tenant access', async () => {
    const response = await request(app)
      .get('/api/v1/device-groups')
      .query({ facility_id: '550e8400-e29b-41d4-a716-446655440001' })
      .set('Authorization', `Bearer ${testData.users.tenant.token}`);
    expectForbidden(response);
  });

  it('validates create payload', async () => {
    const response = await request(app)
      .post('/api/v1/device-groups')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({ facility_id: 'invalid', name: '' });
    expectBadRequest(response);
  });

  it('creates group for facility admin', async () => {
    const response = await request(app)
      .post('/api/v1/device-groups')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Main Zone',
      })
      .expect(201);
    expectSuccess(response);
  });

  it('rejects invalid device_type when removing member', async () => {
    const response = await request(app)
      .delete('/api/v1/device-groups/grp-1/members/550e8400-e29b-41d4-a716-446655440001')
      .query({ device_type: 'invalid_type' })
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

    expectBadRequest(response);
  });

  it('accepts unit-linked blulok group member payload', async () => {
    const response = await request(app)
      .post('/api/v1/device-groups/grp-1/members')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        unit_id: '550e8400-e29b-41d4-a716-446655440011',
        device_type: 'blulok',
      })
      .expect(201);

    expectSuccess(response);
  });

  it('returns 409 with explicit conflict code for exclusivity violations', async () => {
    mockAddMember.mockRejectedValueOnce(
      new ConflictError('Access-control device is already assigned to access-code group "Primary Group"'),
    );

    const response = await request(app)
      .post('/api/v1/device-groups/grp-1/members')
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .send({
        device_id: '550e8400-e29b-41d4-a716-446655440099',
        device_type: 'access_control',
      })
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      code: 'ACCESS_CODE_GROUP_MEMBERSHIP_CONFLICT',
      message: expect.stringContaining('already assigned'),
    }));
  });
});

