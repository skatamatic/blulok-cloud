/** Real `AuthService` — `setup-mocks.ts` stubs this module for most suites. */
jest.mock('@/services/auth.service', () => jest.requireActual('@/services/auth.service'));

import { AuthService } from '@/services/auth.service';
import { UserModel } from '@/models/user.model';
import { UserRole } from '@/types/auth.types';
import * as phoneUtil from '@/utils/phone.util';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('should login with correct credentials', async () => {
      const userData = {
        id: 'user-1',
        email: 'valid@example.com',
        login_identifier: 'valid@example.com',
        password_hash: 'hashed-password',
        first_name: 'Valid',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(userData as any);

      const result = await AuthService.login({
        identifier: 'valid@example.com',
        password: 'plaintextpassword',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('valid@example.com');
    });

    it('should reject incorrect password', async () => {
      const userData = {
        id: 'user-1',
        email: 'invalid@example.com',
        login_identifier: 'invalid@example.com',
        password_hash: 'hashed-password',
        first_name: 'Invalid',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(userData as any);

      const result = await AuthService.login({
        identifier: 'invalid@example.com',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
    });

    it('should reject non-existent user', async () => {
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(undefined);

      const result = await AuthService.login({
        identifier: 'nonexistent@example.com',
        password: 'anypassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
    });

    it('should reject inactive user', async () => {
      const userData = {
        id: 'user-1',
        email: 'inactive@example.com',
        login_identifier: 'inactive@example.com',
        password_hash: 'hashed-password',
        first_name: 'Inactive',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(userData as any);

      const result = await AuthService.login({
        identifier: 'inactive@example.com',
        password: 'plaintextpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Account is deactivated. Please contact administrator.');
    });

    it('rejects empty identifier after trim', async () => {
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('');
      const r = await AuthService.login({ identifier: '', password: 'x' });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Email or phone is required/i);
    });

    it('returns database unavailable when lookup throws', async () => {
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('');
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockRejectedValueOnce(new Error('db down'));
      const r = await AuthService.login({ identifier: 'x@y.com', password: 'password123' });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Database temporarily unavailable/i);
    });

    it('falls back to findByEmail only when login_identifier is missing', async () => {
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('');
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(undefined as any);
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue({
        id: 'u-legacy',
        email: 'legacy@example.com',
        login_identifier: null,
        password_hash: 'hashed-password',
        first_name: 'L',
        last_name: 'E',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      jest.spyOn(UserModel, 'updateLastLogin').mockResolvedValue(undefined as any);

      const r = await AuthService.login({ identifier: 'legacy@example.com', password: 'password123' });
      expect(r.success).toBe(true);
    });

    it('does not log in via a shared email contact when login_identifier is set', async () => {
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('');
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(undefined as any);
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue({
        id: 'u-shared',
        email: 'shared@example.com',
        login_identifier: '+15551234567',
        password_hash: 'hashed-password',
        first_name: 'S',
        last_name: 'H',
        role: UserRole.TENANT,
        is_active: true,
      } as any);

      const r = await AuthService.login({ identifier: 'shared@example.com', password: 'password123' });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Invalid email or password/i);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = {
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: 'hashed',
        first_name: 'Test',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const token = AuthService.generateToken(user as any);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different tokens for different users', () => {
      const user1 = {
        id: 'user-1',
        email: 'user1@example.com',
        password_hash: 'hashed',
        first_name: 'User',
        last_name: 'One',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const user2 = {
        id: 'user-2',
        email: 'user2@example.com',
        password_hash: 'hashed',
        first_name: 'User',
        last_name: 'Two',
        role: UserRole.ADMIN,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const token1 = AuthService.generateToken(user1 as any);
      const token2 = AuthService.generateToken(user2 as any);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const user = {
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: 'hashed',
        first_name: 'Test',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const token = AuthService.generateToken(user as any);
      const decoded = AuthService.verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(user.id);
      expect(decoded?.email).toBe(user.email);
      expect(decoded?.role).toBe(user.role);
    });

    it('should return null for invalid token', () => {
      const decoded = AuthService.verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('permission methods', () => {
    it('should check permissions correctly', () => {
      expect(AuthService.hasPermission(UserRole.ADMIN, [UserRole.ADMIN, UserRole.DEV_ADMIN])).toBe(true);
      expect(AuthService.hasPermission(UserRole.TENANT, [UserRole.ADMIN, UserRole.DEV_ADMIN])).toBe(false);
    });

    it('should identify admin roles correctly', () => {
      expect(AuthService.isAdmin(UserRole.ADMIN)).toBe(true);
      expect(AuthService.isAdmin(UserRole.DEV_ADMIN)).toBe(true);
      expect(AuthService.isAdmin(UserRole.TENANT)).toBe(false);
    });

    it('should identify facility admin correctly', () => {
      expect(AuthService.isFacilityAdmin(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(AuthService.isFacilityAdmin(UserRole.ADMIN)).toBe(false);
    });

    it('should check global admin correctly', () => {
      expect(AuthService.isGlobalAdmin(UserRole.ADMIN)).toBe(true);
      expect(AuthService.isGlobalAdmin(UserRole.DEV_ADMIN)).toBe(true);
      expect(AuthService.isGlobalAdmin(UserRole.FACILITY_ADMIN)).toBe(false);
    });

    it('should check user management permissions', () => {
      expect(AuthService.canManageUsers(UserRole.ADMIN)).toBe(true);
      expect(AuthService.canManageUsers(UserRole.DEV_ADMIN)).toBe(true);
      expect(AuthService.canManageUsers(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(AuthService.canManageUsers(UserRole.TENANT)).toBe(false);
    });

    it('should check facility scoped roles', () => {
      expect(AuthService.isFacilityScoped(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(AuthService.isFacilityScoped(UserRole.TENANT)).toBe(true);
      expect(AuthService.isFacilityScoped(UserRole.ADMIN)).toBe(false);
    });

    it('should check facility access permissions', () => {
      expect(AuthService.canAccessAllFacilities(UserRole.ADMIN)).toBe(true);
      expect(AuthService.canAccessAllFacilities(UserRole.DEV_ADMIN)).toBe(true);
      expect(AuthService.canAccessAllFacilities(UserRole.FACILITY_ADMIN)).toBe(false);
    });
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        role: UserRole.TENANT,
      };

      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([]);
      jest.spyOn(UserModel, 'create').mockResolvedValue({ id: 'new-user-id' } as any);

      const result = await AuthService.createUser(userData);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('new-user-id');
    });

    it('should reject duplicate email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Existing',
        lastName: 'User',
        role: UserRole.TENANT,
      };

      const existing = {
        id: 'existing-user',
        email: 'existing@example.com',
        login_identifier: 'existing@example.com',
        is_active: true,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([existing] as any);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([existing] as any);
      jest.spyOn(UserModel, 'findById').mockResolvedValue(existing as any);

      const result = await AuthService.createUser(userData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('User with this email already exists');
    });

    it('returns USER_INACTIVE when email matches an inactive user', async () => {
      const inactive = {
        id: 'inactive-1',
        email: 'gone@example.com',
        login_identifier: 'gone@example.com',
        first_name: 'Gone',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: false,
        phone_number: null,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([inactive] as any);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([inactive] as any);
      jest.spyOn(UserModel, 'findById').mockResolvedValue(inactive as any);

      const result = await AuthService.createUser({
        email: 'gone@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'Name',
        role: UserRole.TENANT,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('USER_INACTIVE');
      expect(result.inactiveUser).toEqual(
        expect.objectContaining({
          id: 'inactive-1',
          email: 'gone@example.com',
          firstName: 'Gone',
          lastName: 'User',
        }),
      );
    });

    it('reactivates inactive user when reactivateIfInactive is set', async () => {
      const inactive = {
        id: 'inactive-1',
        email: 'gone@example.com',
        first_name: 'Gone',
        last_name: 'User',
        role: UserRole.TENANT,
        is_active: false,
        phone_number: null,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([inactive] as any);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([inactive] as any);
      jest.spyOn(UserModel, 'findById').mockResolvedValue(inactive as any);
      jest.spyOn(UserModel, 'updateById').mockResolvedValue(undefined as any);
      jest.spyOn(UserModel, 'setPhoneNumber').mockResolvedValue(undefined as any);
      jest.spyOn(UserModel, 'activateUser').mockResolvedValue({ ...inactive, is_active: true } as any);

      const result = await AuthService.createUser(
        {
          email: 'gone@example.com',
          password: 'NewPass1!',
          firstName: 'Restored',
          lastName: 'Person',
          role: UserRole.MAINTENANCE,
        },
        { reactivateIfInactive: true },
      );

      expect(result.success).toBe(true);
      expect(result.reactivated).toBe(true);
      expect(result.userId).toBe('inactive-1');
      expect(UserModel.updateById).toHaveBeenCalledWith(
        'inactive-1',
        expect.objectContaining({
          first_name: 'Restored',
          last_name: 'Person',
          role: UserRole.MAINTENANCE,
          is_active: true,
          requires_password_reset: false,
        }),
      );
      expect(UserModel.activateUser).toHaveBeenCalledWith('inactive-1');
    });

    it('rejects creating a new email on a phone-only user’s exclusive phone', async () => {
      const inactivePhone = {
        id: 'inactive-phone',
        email: null,
        login_identifier: '+15551234567',
        first_name: 'Old',
        last_name: 'Phone',
        role: UserRole.TENANT,
        is_active: false,
        phone_number: '+15551234567',
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('+15551234567');
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([inactivePhone] as any);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([inactivePhone] as any);
      jest.spyOn(UserModel, 'findById').mockResolvedValue(inactivePhone as any);

      const result = await AuthService.createUser({
        email: 'brandnew@example.com',
        password: 'password123',
        firstName: 'Brand',
        lastName: 'New',
        role: UserRole.TENANT,
        phoneNumber: '(555) 123-4567',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NO_UNIQUE_LOGIN_HANDLE');
    });

    it('rejects when email and phone belong to different users', async () => {
      const userA = {
        id: 'user-a',
        email: 'a@example.com',
        phone_number: '+15550000001',
        login_identifier: 'a@example.com',
        is_active: true,
      };
      const userB = {
        id: 'user-b',
        email: 'b@example.com',
        phone_number: '+15559876543',
        login_identifier: '+15559876543',
        is_active: true,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([userA] as any);
      jest.spyOn(phoneUtil, 'toE164').mockImplementation((value: string) => (
        String(value).startsWith('+') ? String(value) : '+15559876543'
      ));
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([userB] as any);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([userA, userB] as any);
      jest.spyOn(UserModel, 'findById').mockImplementation(async (id: string) => (
        id === userA.id ? userA : id === userB.id ? userB : undefined
      ) as any);

      const result = await AuthService.createUser({
        email: 'a@example.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'User',
        role: UserRole.TENANT,
        phoneNumber: '(555) 987-6543',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('IDENTITY_CONFLICT');
    });

    it('rejects invalid phone number', async () => {
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined as any);
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('12');
      const r = await AuthService.createUser({
        email: 'p@example.com',
        password: 'password123',
        firstName: 'P',
        lastName: 'H',
        role: UserRole.TENANT,
        phoneNumber: '12',
      });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Invalid phone number/i);
    });

    it('rejects a shared phone when the new user has no exclusive handle left for the peer', async () => {
      const other = {
        id: 'other',
        email: null,
        phone_number: '+15559876543',
        login_identifier: '+15559876543',
        is_active: true,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('+15559876543');
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([other] as any);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([other] as any);
      const r = await AuthService.createUser({
        email: 'newphone@example.com',
        password: 'password123',
        firstName: 'N',
        lastName: 'P',
        role: UserRole.TENANT,
        phoneNumber: '(555) 987-6543',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('NO_UNIQUE_LOGIN_HANDLE');
    });

    it('allows unique email with a shared phone', async () => {
      const peer = {
        id: 'peer',
        email: 'peer@example.com',
        phone_number: '+15559876543',
        login_identifier: 'peer@example.com',
        is_active: true,
      };
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('+15559876543');
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([peer] as any);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([]);
      const createSpy = jest.spyOn(UserModel, 'create').mockResolvedValue({ id: 'new-shared-phone' } as any);

      const r = await AuthService.createUser({
        email: 'unique@example.com',
        password: 'password123',
        firstName: 'U',
        lastName: 'N',
        role: UserRole.TENANT,
        phoneNumber: '(555) 987-6543',
      });

      expect(r.success).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          login_identifier: 'unique@example.com',
          phone_number: '+15559876543',
        }),
      );
    });

    it('creates provisional user without password (requires reset)', async () => {
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([]);
      const createSpy = jest.spyOn(UserModel, 'create').mockResolvedValue({ id: 'prov-1' } as any);

      const r = await AuthService.createUser({
        email: 'nopass@example.com',
        password: '',
        firstName: 'N',
        lastName: 'P',
        role: UserRole.TENANT,
      });

      expect(r.success).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          requires_password_reset: true,
          password_hash: '!',
        })
      );
    });

    it('returns generic error when create throws', async () => {
      jest.spyOn(UserModel, 'findAllByEmail').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByPhone').mockResolvedValue([]);
      jest.spyOn(UserModel, 'findAllByLoginIdentifiers').mockResolvedValue([]);
      jest.spyOn(UserModel, 'create').mockRejectedValueOnce(new Error('fail'));
      const r = await AuthService.createUser({
        email: 'err@example.com',
        password: 'password123',
        firstName: 'E',
        lastName: 'R',
        role: UserRole.TENANT,
      });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/An error occurred while creating user/i);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userData = {
        id: 'user-1',
        email: 'changepass@example.com',
        password_hash: 'old-hashed-password',
        first_name: 'Change',
        last_name: 'Password',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest.spyOn(UserModel, 'findById').mockResolvedValue(userData as any);
      jest.spyOn(UserModel, 'updateById').mockResolvedValue(undefined as any);

      const result = await AuthService.changePassword('user-1', 'oldpassword', 'newpassword');

      expect(result.success).toBe(true);
    });

    it('should reject for non-existent user', async () => {
      jest.spyOn(UserModel, 'findById').mockResolvedValue(undefined);

      const result = await AuthService.changePassword('nonexistent-id', 'oldpassword', 'newpassword');

      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });

    it('rejects when current password is wrong', async () => {
      jest.spyOn(UserModel, 'findById').mockResolvedValue({
        id: 'u1',
        email: 'x@example.com',
        password_hash: 'hashed-password',
        first_name: 'X',
        last_name: 'Y',
        role: UserRole.TENANT,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const r = await AuthService.changePassword('u1', 'not-in-valid-list', 'newpassword');
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Current password is incorrect/i);
    });
  });

  describe('canAccessFacility', () => {
    it('returns true for global admin without association check', async () => {
      const r = await AuthService.canAccessFacility('any', UserRole.ADMIN, 'fac-1');
      expect(r).toBe(true);
    });

    it('delegates to association model for tenant', async () => {
      const fid = '550e8400-e29b-41d4-a716-446655440001';
      const r = await AuthService.canAccessFacility('tenant-1', UserRole.TENANT, fid);
      expect(r).toBe(true);
    });
  });
});
