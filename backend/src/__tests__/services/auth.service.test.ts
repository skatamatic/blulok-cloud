import { AuthService } from '../../services/auth.service';
import { UserModel } from '../../models/user.model';
import { UserRole } from '../../types/auth.types';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login with correct credentials', async () => {
      // Mock user data
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

      // Mock UserModel.findByLoginIdentifier to return our test user
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
      // Mock user data
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

      // Mock UserModel.findByLoginIdentifier to return our test user
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(userData as any);

      const result = await AuthService.login({
        identifier: 'invalid@example.com',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      // Mock UserModel.findByLoginIdentifier to return undefined
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(undefined);

      const result = await AuthService.login({
        identifier: 'nonexistent@example.com',
        password: 'anypassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      // Mock inactive user data
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

      // Mock UserModel.findByLoginIdentifier to return inactive user
      jest.spyOn(UserModel, 'findByLoginIdentifier').mockResolvedValue(userData as any);

      const result = await AuthService.login({
        identifier: 'inactive@example.com',
        password: 'plaintextpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Account is deactivated. Please contact administrator.');
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

      const token = AuthService.generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
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

      const token1 = AuthService.generateToken(user1);
      const token2 = AuthService.generateToken(user2);

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

      const token = AuthService.generateToken(user);
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

      // Mock UserModel methods
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

      // Mock existing user
      jest.spyOn(UserModel, 'findByEmail').mockResolvedValue({ id: 'existing-user' } as any);

      const result = await AuthService.createUser(userData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('User with this email already exists');
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

      // Mock UserModel methods
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
});