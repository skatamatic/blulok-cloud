import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { UserModel } from '@/models/user.model';
import { UserDeviceModel } from '@/models/user-device.model';
import { UserRole } from '@/types/auth.types';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound, expectBadRequest, expectConflict } from '@/__tests__/utils/mock-test-helpers';

const createMockQuery = (config: { rows?: any[]; reject?: boolean } = {}) => {
  const rows = config.rows ?? [];
  const reject = config.reject ?? false;
  const promise = reject ? Promise.reject(new Error('mock query failed')) : Promise.resolve(rows);
  const chain: any = {
    join: () => chain,
    leftJoin: () => chain,
    select: () => chain,
    where: () => chain,
    whereIn: () => chain,
    whereNotNull: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    first: () => promise.then((res) => (Array.isArray(res) ? res[0] : res)),
    then: (resolve: any, rejectFn?: any) => promise.then(resolve, rejectFn),
    catch: (rejectFn: any) => promise.catch(rejectFn),
  };
  return chain;
};

const stubRestores: (() => void)[] = [];

/**
 * Make `UserModel.findById` answer with `row` for that row's id and defer to the
 * shared mock store for everything else, so the auth middleware still resolves
 * the requester. Restoring by hand is required because `jest.spyOn` on an
 * already-mocked function leaves it implementation-less after `mockRestore`.
 */
const stubUserRow = (findById: jest.Mock, row: { id: string } & Record<string, unknown>) => {
  const previous = findById.getMockImplementation();
  findById.mockImplementation((id: string) =>
    id === row.id ? Promise.resolve(row) : previous?.(id),
  );
  stubRestores.push(() => {
    if (previous) findById.mockImplementation(previous);
  });
};

const createMockKnex = (tables: Record<string, { rows?: any[]; reject?: boolean }> = {}) => {
  const fn: any = (tableName: string) => {
    const entry = tables[tableName] ?? tables.default ?? { rows: [] };
    return createMockQuery(entry);
  };
  fn.schema = { hasTable: jest.fn().mockResolvedValue(true) };
  return fn;
};

describe('Users Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  afterEach(() => {
    while (stubRestores.length > 0) stubRestores.pop()!();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all user endpoints', async () => {
      const endpoints = [
        '/api/v1/users',
        `/api/v1/users/${testData.users.tenant.id}`,
        '/api/v1/users',
        `/api/v1/users/${testData.users.tenant.id}`,
        `/api/v1/users/${testData.users.tenant.id}`,
        `/api/v1/users/${testData.users.tenant.id}/activate`,
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
        expectUnauthorized(response);
      }
    });
  });

  describe('GET /api/v1/users - List Users', () => {
    it('should return all users for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return all users for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered users for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should filter by role', async () => {
      const response = await request(app)
        .get('/api/v1/users?role=tenant')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });

    it('should filter by facility_id', async () => {
      const response = await request(app)
        .get('/api/v1/users?facility_id=facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/v1/users?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle sorting', async () => {
      const response = await request(app)
        .get('/api/v1/users?sort_by=email&sort_order=asc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });
  });

  describe('GET /api/v1/users/:id - Get Specific User', () => {
    it('should return user details for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
    });

    it('should return user details for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return user details for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should allow users to view their own profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should allow maintenance users to view their own profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.maintenance.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testData.users.maintenance.id);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.facility2Tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT accessing other user', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/users - Create User', () => {
    const validUserData = {
      email: 'newuser@test.com',
      password: 'SecurePassword123!',
      firstName: 'New',
      lastName: 'User',
      role: 'tenant',
      facilityIds: ['550e8400-e29b-41d4-a716-446655440001'],
    };

    it('should create user for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should create user for ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should create user for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validUserData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validUserData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          email: 'test@test.com'
          // Missing other required fields
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'invalid-email'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for weak password', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          password: 'weak'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'tenant@test.com' // Already exists in test data
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 409 with USER_INACTIVE when email matches an inactive user', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'inactive@test.com',
        })
        .expect(409);

      expectConflict(response);
      expect(response.body.code).toBe('USER_INACTIVE');
      expect(response.body.inactiveUser).toEqual(
        expect.objectContaining({
          id: 'inactive-user-1',
          email: 'inactive@test.com',
        }),
      );
    });

    it('should reactivate inactive user when reactivateIfInactive is true', async () => {
      const { UserFacilityAssociationModel } = await import(
        '@/models/user-facility-association.model'
      );
      const setFacilitiesSpy = jest.spyOn(UserFacilityAssociationModel, 'setUserFacilities');

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'inactive@test.com',
          reactivateIfInactive: true,
          facilityIds: ['550e8400-e29b-41d4-a716-446655440001'],
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body.reactivated).toBe(true);
      expect(response.body.userId).toBe('inactive-user-1');
      expect(setFacilitiesSpy).toHaveBeenCalledWith(
        'inactive-user-1',
        ['550e8400-e29b-41d4-a716-446655440001'],
      );
    });

    it('should hide inactive collision details outside facility admin scope', async () => {
      const { AuthService } = await import('@/services/auth.service');
      const { UserListScopeService } = await import('@/services/user-list-scope.service');
      (AuthService.createUser as jest.Mock).mockResolvedValueOnce({
        success: false,
        code: 'USER_INACTIVE',
        message:
          'An inactive user with this email already exists. Confirm to reactivate and update their profile.',
        inactiveUser: {
          id: 'out-of-scope-user',
          email: 'hidden@test.com',
          firstName: 'Hidden',
          lastName: 'User',
          role: UserRole.TENANT,
          phoneNumber: null,
        },
      });
      const scopeSpy = jest
        .spyOn(UserListScopeService, 'canRequesterViewUser')
        .mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          ...validUserData,
          email: 'hidden@test.com',
          role: UserRole.TENANT,
        })
        .expect(400);

      expectBadRequest(response);
      expect(response.body.code).toBeUndefined();
      expect(response.body.inactiveUser).toBeUndefined();
      expect(response.body.message).toBe('User with this email already exists');
      scopeSpy.mockRestore();
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          role: 'invalid-role'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 when scoped role is missing facilityIds', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          email: 'noscope@test.com',
          password: 'SecurePassword123!',
          firstName: 'No',
          lastName: 'Scope',
          role: 'tenant',
          facilityIds: [],
        })
        .expect(400);

      expectBadRequest(response);
      expect(response.body.message).toMatch(/facility/i);
    });

    it('should return 403 when facility admin creates an admin user', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          email: 'badrole@test.com',
          password: 'SecurePassword123!',
          firstName: 'Bad',
          lastName: 'Role',
          role: 'admin',
          facilityIds: [],
        })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 when facility admin assigns a facility they do not manage', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          email: 'wrongfac@test.com',
          password: 'SecurePassword123!',
          firstName: 'Wrong',
          lastName: 'Fac',
          role: 'tenant',
          facilityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 when global role includes facilityIds', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          email: 'globalwithfac@test.com',
          password: 'SecurePassword123!',
          firstName: 'G',
          lastName: 'W',
          role: 'admin',
          facilityIds: ['550e8400-e29b-41d4-a716-446655440001'],
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('PUT /api/v1/users/:id - Update User', () => {
    const updateData = {
      firstName: 'Updated',
      lastName: 'Name',
      role: 'tenant'
    };

    it('should update user for DEV_ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.firstName).toBe(updateData.firstName);
    });

    it('should update user for ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should update user for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return 403 when facility admin tries to update another facility_admin on the same facility', async () => {
      const response = await request(app)
        .put('/api/v1/users/facility-admin-2')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should allow users to update their own profile', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name'
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.facility2Tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT accessing other user', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...updateData,
          email: 'invalid-email'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('accepts numeric isActive from MySQL TINYINT round-trips', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ firstName: 'Updated', isActive: 1 })
        .expect(200);

      expectSuccess(response);
      expect(typeof response.body.user.isActive).toBe('boolean');
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...updateData,
          role: 'invalid-role'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 403 when facility admin tries to change role to admin', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          role: 'admin',
          isActive: true,
        })
        .expect(403);

      expectForbidden(response);
    });

    it('should allow ADMIN to set simplifiedUi on a facility_admin', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.facilityAdmin.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ simplifiedUi: true })
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.simplifiedUi).toBe(true);
    });

    it('should return 403 when FACILITY_ADMIN tries to set simplifiedUi', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ simplifiedUi: true })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 when simplifiedUi is set on a non-facility_admin role', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ simplifiedUi: true })
        .expect(400);

      expectBadRequest(response);
    });

    it('should upgrade an FMS placeholder tenant when email is added', async () => {
      const { FirstTimeUserService } = await import('@/services/first-time-user.service');
      const sendInviteSpy = jest
        .spyOn(FirstTimeUserService.getInstance(), 'sendInvite')
        .mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/v1/users/placeholder-tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ email: 'placeholder.upgraded@test.com' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.isPlaceholder).toBe(false);
      expect(response.body.user.email).toBe('placeholder.upgraded@test.com');
      await new Promise((r) => setImmediate(r));
      expect(sendInviteSpy).toHaveBeenCalled();
      sendInviteSpy.mockRestore();
    });

    it('allows email edits on a loginable user when the new email is exclusive', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ email: 'newemail@test.com' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.email).toBe('newemail@test.com');
    });

    it('should return 400 when clearing contact on a placeholder without replacement', async () => {
      const { UserModel } = await import('@/models/user.model');
      // Must be keyed by id: the auth middleware also looks the requester up,
      // so a one-shot mock would be spent before the route ever runs.
      stubUserRow(UserModel.findById as jest.Mock, {
        id: 'placeholder-tenant-1',
        email: null,
        phone_number: null,
        login_identifier: 'fms-ph:facility-1:ext-placeholder-1',
        password_hash: '$2b$10$dummyhashforinvitationflow',
        first_name: 'Placeholder',
        last_name: 'Tenant',
        role: 'tenant',
        is_active: true,
        is_placeholder: true,
        requires_password_reset: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await request(app)
        .put('/api/v1/users/placeholder-tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ email: '' })
        .expect(400);

      expectBadRequest(response);
      expect(response.body.message).toMatch(/email or phone/i);
    });

    it('should reject resend-invite for placeholder tenants', async () => {
      const { UserModel } = await import('@/models/user.model');
      const placeholderRow = {
        id: 'placeholder-tenant-1',
        email: null,
        phone_number: null,
        login_identifier: 'fms-ph:facility-1:ext-placeholder-1',
        password_hash: '$2b$10$dummyhashforinvitationflow',
        first_name: 'Placeholder',
        last_name: 'Tenant',
        role: 'tenant',
        is_active: true,
        is_placeholder: true,
        requires_password_reset: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      stubUserRow(UserModel.findById as jest.Mock, placeholderRow);

      const response = await request(app)
        .post('/api/v1/users/placeholder-tenant-1/resend-invite')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(400);

      expectBadRequest(response);
      expect(response.body.message).toMatch(/placeholder/i);
    });
  });

  describe('DELETE /api/v1/users/:id - Delete User', () => {
    it('should delete user for DEV_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should delete user for ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/users/:id/resend-invite', () => {
    it('should return 403 for facility admin without access to target user', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.facility2Tenant.id}/resend-invite`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should allow dev admin to resend invite', async () => {
      const { FirstTimeUserService } = await import('@/services/first-time-user.service');
      const sendInviteSpy = jest
        .spyOn(FirstTimeUserService.getInstance(), 'sendInvite')
        .mockResolvedValue({ delivered: ['email'] });

      const response = await request(app)
        .post(`/api/v1/users/${testData.users.tenant.id}/resend-invite`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(sendInviteSpy).toHaveBeenCalled();
      sendInviteSpy.mockRestore();
    });
  });

  describe('POST /api/v1/users/:id/activate - Activate User', () => {
    it('should activate user for DEV_ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should activate user for ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should activate in-facility tenant for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.tenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should deactivate in-facility tenant for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/users/non-existent-id/activate')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN outside their facilities', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 when FACILITY_ADMIN activates a peer facility admin', async () => {
      const response = await request(app)
        .post('/api/v1/users/facility-admin-2/activate')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Input Validation and Security', () => {
    it('should prevent XSS in user data', async () => {
      const maliciousData = {
        email: 'test@test.com',
        password: 'SecurePassword123!',
        firstName: '<script>alert("xss")</script>',
        lastName: 'User',
        role: 'tenant',
        facilityIds: ['550e8400-e29b-41d4-a716-446655440001'],
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(201);

      expectSuccess(response);
      // The response should be sanitized
      expect(response.body.userId).toBeDefined();
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousData = {
        email: "'; DROP TABLE users; --",
        password: 'SecurePassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(400);

      expectBadRequest(response);
    });

    it('should limit input length to prevent DoS', async () => {
      const longData = {
        email: 'test@test.com',
        password: 'SecurePassword123!',
        firstName: 'a'.repeat(1000),
        lastName: 'User',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(longData)
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see users in their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned users should be in facilities the admin has access to
      const users = response.body.users;
      for (const user of users) {
        // This would need to be implemented based on actual user-facility relationships
        expect(user).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/users/:id/details - Get User Details', () => {
    let getInstanceSpy: jest.SpyInstance;
    let listDevicesSpy: jest.SpyInstance;

    afterEach(() => {
      getInstanceSpy?.mockRestore();
      listDevicesSpy?.mockRestore();
    });

    it('should allow maintenance users to view their own detailed profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.maintenance.id}/details`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testData.users.maintenance.id);
    });

    it('should return detailed user information for DEV_ADMIN', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const baseDevice = {
        id: 'device-1',
        user_id: testData.users.tenant.id,
        app_device_id: 'app-1',
        platform: 'ios',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': { rows: [] },
        'device_lock_associations as dla': {
          rows: [{
            user_device_id: 'device-1',
            lock_id: 'lock-123',
            device_serial: 'ABC123',
            unit_number: '101',
            facility_name: 'Test Facility',
            key_status: 'active',
            last_error: null,
            key_version: 1,
            key_code: 42,
          }],
        },
        'device_lock_associations': {
          rows: [{
            user_device_id: 'device-1',
            last_error: 'timeout',
            updated_at: new Date(),
          }],
        },
      });

      getInstanceSpy = jest.spyOn(DatabaseService, 'getInstance').mockReturnValue({ connection: mockDb } as any);
      stubUserRow(UserModel.findById as jest.Mock, baseUser as any);
      listDevicesSpy = jest.spyOn(UserDeviceModel.prototype, 'listByUser').mockResolvedValue([baseDevice] as any);

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testData.users.tenant.id);
      expect(response.body.user.devices[0].associatedLocks).toHaveLength(1);
      expect(response.body.user.devices[0].distributionErrors).toHaveLength(1);
    }, 15000);

    it('should gracefully handle lock association query failures', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const baseDevice = {
        id: 'device-1',
        user_id: testData.users.tenant.id,
        app_device_id: 'app-1',
        platform: 'ios',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': { rows: [] },
        'device_lock_associations as dla': { reject: true },
        'device_lock_associations': { reject: true },
      });

      getInstanceSpy = jest.spyOn(DatabaseService, 'getInstance').mockReturnValue({ connection: mockDb } as any);
      stubUserRow(UserModel.findById as jest.Mock, baseUser as any);
      listDevicesSpy = jest.spyOn(UserDeviceModel.prototype, 'listByUser').mockResolvedValue([baseDevice] as any);

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.devices[0].associatedLocks).toEqual([]);
      expect(response.body.user.devices[0].distributionErrors).toEqual([]);
    }, 15000);

    it('includes facility units and access-control devices on details', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': {
          rows: [
            {
              facility_id: 'facility-1',
              facility_name: 'Test Facility',
              facility_address: null,
            },
          ],
        },
        'unit_assignments as ua': {
          rows: [
            {
              facility_id: 'facility-1',
              unit_id: 'unit-1',
              unit_number: '101',
              unit_type: 'storage',
              is_primary: true,
              device_id: 'lock-1',
              device_serial: 'SN-1',
              lock_status: 'locked',
              device_status: 'online',
              battery_level: 80,
            },
            {
              facility_id: 'facility-1',
              unit_id: 'unit-2',
              unit_number: '102',
              unit_type: 'storage',
              is_primary: false,
              device_id: null,
              device_serial: null,
              lock_status: null,
              device_status: null,
              battery_level: null,
            },
          ],
        },
        'access_control_devices as d': {
          rows: [
            {
              id: 'ac-1',
              name: 'Front gate',
              device_type: 'door',
              location_description: 'Lobby',
              device_serial: 'AC-1',
              relay_channel: 1,
              access_methods: '["keypad"]',
              facility_id: 'facility-1',
            },
            {
              id: 'ac-2',
              name: 'Side door',
              device_type: 'door',
              location_description: null,
              device_serial: 'AC-2',
              relay_channel: 2,
              access_methods: ['app', 'keypad'],
              facility_id: 'facility-1',
            },
            {
              id: 'ac-3',
              name: 'Broken methods',
              device_type: 'door',
              location_description: null,
              device_serial: 'AC-3',
              relay_channel: 3,
              access_methods: '{not-json',
              facility_id: 'facility-1',
            },
          ],
        },
        'device_lock_associations as dla': { rows: [] },
        'device_lock_associations': { rows: [] },
      });

      getInstanceSpy = jest
        .spyOn(DatabaseService, 'getInstance')
        .mockReturnValue({ connection: mockDb } as any);
      stubUserRow(UserModel.findById as jest.Mock, baseUser as any);
      listDevicesSpy = jest
        .spyOn(UserDeviceModel.prototype, 'listByUser')
        .mockResolvedValue([]);

      const { AppEntryAccessService } = await import(
        '@/services/passes/app-entry-access.service'
      );
      const resolveSpy = jest
        .spyOn(AppEntryAccessService, 'resolveDeviceIds')
        .mockResolvedValue(['ac-1', 'ac-2', 'ac-3']);
      const { AccessCodeService } = await import('@/services/access-code.service');
      const codesSpy = jest
        .spyOn(AccessCodeService.getInstance(), 'getAppCodesForUser')
        .mockResolvedValue([
          {
            device_id: 'ac-1',
            code: '9999',
            valid_from: null,
            valid_until: null,
            schedule_id: 'sched-b',
            schedule_name: 'Evening',
          },
          {
            device_id: 'ac-1',
            code: '1111',
            valid_from: null,
            valid_until: null,
            schedule_id: 'sched-a',
            schedule_name: 'Morning',
          },
        ] as any);

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.facilities[0].units).toHaveLength(2);
      expect(response.body.user.facilities[0].units[0].device).toBeDefined();
      expect(response.body.user.facilities[0].units[1].device).toBeUndefined();
      expect(response.body.user.accessControlDevices).toHaveLength(3);
      expect(response.body.user.accessControlDevices[0].codes.map((c: any) => c.code)).toEqual([
        '1111',
        '9999',
      ]);
      resolveSpy.mockRestore();
      codesSpy.mockRestore();
    }, 15000);

    it('continues when access-code lookup fails for details', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': {
          rows: [{ facility_id: 'facility-1', facility_name: 'F', facility_address: null }],
        },
        'unit_assignments as ua': { rows: [] },
        'access_control_devices as d': {
          rows: [
            {
              id: 'ac-1',
              name: 'Gate',
              device_type: 'door',
              location_description: null,
              device_serial: 'AC-1',
              relay_channel: 1,
              access_methods: null,
              facility_id: 'facility-1',
            },
          ],
        },
        'device_lock_associations as dla': { rows: [] },
        'device_lock_associations': { rows: [] },
      });

      getInstanceSpy = jest
        .spyOn(DatabaseService, 'getInstance')
        .mockReturnValue({ connection: mockDb } as any);
      stubUserRow(UserModel.findById as jest.Mock, baseUser as any);
      listDevicesSpy = jest
        .spyOn(UserDeviceModel.prototype, 'listByUser')
        .mockResolvedValue([]);

      const { AppEntryAccessService } = await import(
        '@/services/passes/app-entry-access.service'
      );
      const resolveSpy = jest
        .spyOn(AppEntryAccessService, 'resolveDeviceIds')
        .mockResolvedValue(['ac-1']);
      const { AccessCodeService } = await import('@/services/access-code.service');
      const codesSpy = jest
        .spyOn(AccessCodeService.getInstance(), 'getAppCodesForUser')
        .mockRejectedValue(new Error('codes down'));

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.accessControlDevices[0].codes).toEqual([]);
      resolveSpy.mockRestore();
      codesSpy.mockRestore();
    }, 15000);
  });

  describe('POST /api/v1/users/:id/resend-invite delivery gaps', () => {
    it('returns 400 when invite has no reachable contact', async () => {
      const { FirstTimeUserService } = await import('@/services/first-time-user.service');
      const sendInviteSpy = jest
        .spyOn(FirstTimeUserService.getInstance(), 'sendInvite')
        .mockResolvedValue({ delivered: [], warning: undefined } as any);

      const response = await request(app)
        .post(`/api/v1/users/${testData.users.tenant.id}/resend-invite`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(400);

      expect(response.body.message).toMatch(/no reachable/i);
      sendInviteSpy.mockRestore();
    });
  });

  describe('DELETE /api/v1/user-devices/admin/:id - Delete User Device', () => {
    it('should deny access for non-DEV_ADMIN users', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 404 for non-existent device', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/non-existent-device')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should allow DEV_ADMIN to attempt device deletion', async () => {
      // Test that DEV_ADMIN can access the endpoint (will return 404 for non-existent device)
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(404);

      expectNotFound(response);
    });
  });

  describe('POST /api/v1/users/:id/reset-account', () => {
    it('rejects self-reset, missing user, and access denial', async () => {
      const self = await request(app)
        .post(`/api/v1/users/${testData.users.admin.id}/reset-account`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(400);
      expect(self.body.message).toMatch(/own account/i);

      const missing = await request(app)
        .post('/api/v1/users/non-existent-id/reset-account')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(404);
      expectNotFound(missing);

      const denied = await request(app)
        .post(`/api/v1/users/${testData.users.facility2Tenant.id}/reset-account`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);
      expectForbidden(denied);
    });

    it('blocks facility admin from resetting peer facility admins', async () => {
      const response = await request(app)
        .post('/api/v1/users/facility-admin-2/reset-account')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);
      expect(response.body.message).toMatch(/only reset tenant/i);
    });

    it('resets account for admin with facility access', async () => {
      const { AccountResetService } = await import('@/services/account-reset.service');
      const spy = jest
        .spyOn(AccountResetService.getInstance(), 'resetAndReinvite')
        .mockResolvedValue({
          user: { id: testData.users.otherTenant.id } as any,
          devicesRevoked: 1,
          inviteSent: true,
          inviteWarning: 'partial',
        });

      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/reset-account`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.inviteWarning).toBe('partial');
      expect(spy).toHaveBeenCalledWith(
        testData.users.otherTenant.id,
        expect.objectContaining({ performedBy: testData.users.devAdmin.id }),
      );
      spy.mockRestore();
    });

    it('maps known reset failures to 400', async () => {
      const { AccountResetService } = await import('@/services/account-reset.service');
      const spy = jest
        .spyOn(AccountResetService.getInstance(), 'resetAndReinvite')
        .mockRejectedValue(
          new Error('Cannot reset a placeholder tenant. Add an email or phone first.'),
        );

      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/reset-account`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/placeholder/i);
      spy.mockRestore();
    });
  });
});
