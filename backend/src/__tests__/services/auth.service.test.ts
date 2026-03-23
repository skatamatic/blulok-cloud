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

    it('falls back to findByEmail when login identifier misses', async () => {
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('');
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(undefined as any);
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue({
        id: 'u-legacy',
        email: 'legacy@example.com',
        login_identifier: 'legacy@example.com',
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

      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined);
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

      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue({ id: 'existing-user' } as any);

      const result = await AuthService.createUser(userData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('User with this email already exists');
    });

    it('rejects invalid phone number', async () => {
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined as any);
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

    it('rejects duplicate phone', async () => {
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined as any);
      jest.spyOn(phoneUtil, 'toE164').mockReturnValue('+15559876543');
      jest.spyOn(UserModel, 'findByPhone').mockResolvedValue({ id: 'other' } as any);
      const r = await AuthService.createUser({
        email: 'newphone@example.com',
        password: 'password123',
        firstName: 'N',
        lastName: 'P',
        role: UserRole.TENANT,
        phoneNumber: '(555) 987-6543',
      });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/Phone number already in use/i);
    });

    it('creates provisional user without password (requires reset)', async () => {
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined as any);
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
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue(undefined as any);
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
