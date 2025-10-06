import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { JWTPayload, LoginRequest, LoginResponse, CreateUserRequest, UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';

export class AuthService {
  private static readonly SALT_ROUNDS = 12;

  public static async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const { email, password } = credentials;

      // Check if database is available
      try {
        // Find user by email
        const user = await UserModel.findByEmail(email.toLowerCase());
        if (!user) {
          logger.warn(`Login attempt with invalid email: ${email}`);
          return {
            success: false,
            message: 'Invalid email or password'
          };
        }

        // Check if user is active
        if (!user.is_active) {
          logger.warn(`Login attempt with inactive account: ${email}`);
          return {
            success: false,
            message: 'Account is deactivated. Please contact administrator.'
          };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          logger.warn(`Login attempt with invalid password: ${email}`);
          return {
            success: false,
            message: 'Invalid email or password'
          };
        }

        // Update last login (ignore errors)
        try {
          await UserModel.updateLastLogin(user.id);
        } catch (updateError) {
          logger.warn(`Failed to update last login for ${email}:`, updateError);
        }

        // Get user's facility associations if they're facility-scoped
        let facilityIds: string[] = [];
        if (this.isFacilityScoped(user.role as UserRole)) {
          facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(user.id);
        }

        // Generate JWT token
        const token = this.generateToken(user, facilityIds);

        logger.info(`Successful login: ${email}`);
        
        return {
          success: true,
          message: 'Login successful',
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role as UserRole
          },
          token
        };

      } catch (dbError) {
        logger.error(`Database error during login for ${email}:`, dbError);
        return {
          success: false,
          message: 'Database temporarily unavailable. Please try again later.'
        };
      }

    } catch (error) {
      logger.error(`Login error: ${error}`);
      return {
        success: false,
        message: 'An error occurred during login'
      };
    }
  }

  public static async createUser(userData: CreateUserRequest): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
      const { email, password, firstName, lastName, role } = userData;

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(email.toLowerCase());
      if (existingUser) {
        return {
          success: false,
          message: 'User with this email already exists'
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

      // Create user
      const newUser = await UserModel.create({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role,
        is_active: true
      }) as User;

      logger.info(`User created: ${email} with role ${role}`);

      return {
        success: true,
        message: 'User created successfully',
        userId: newUser.id
      };

    } catch (error) {
      logger.error(`Create user error: ${error}`);
      return {
        success: false,
        message: 'An error occurred while creating user'
      };
    }
  }

  public static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await UserModel.findById(userId) as User;
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Current password is incorrect'
        };
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      // Update password
      await UserModel.updateById(userId, {
        password_hash: newPasswordHash
      });

      logger.info(`Password changed for user: ${user.email}`);

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      logger.error(`Change password error: ${error}`);
      return {
        success: false,
        message: 'An error occurred while changing password'
      };
    }
  }

  public static generateToken(user: User, facilityIds?: string[]): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      firstName: user.first_name,
      lastName: user.last_name,
      facilityIds: facilityIds || []
    };

    return jwt.sign(payload, config.jwt.secret, { expiresIn: '24h' });
  }

  public static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
      return decoded;
    } catch (error) {
      logger.warn(`Invalid token: ${error}`);
      return null;
    }
  }

  public static hasPermission(userRole: UserRole, requiredRoles: UserRole[]): boolean {
    return requiredRoles.includes(userRole);
  }

  public static isAdmin(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN;
  }

  public static isFacilityAdmin(userRole: UserRole): boolean {
    return userRole === UserRole.FACILITY_ADMIN;
  }

  public static isGlobalAdmin(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN;
  }

  public static canManageUsers(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN || userRole === UserRole.FACILITY_ADMIN;
  }

  public static isFacilityScoped(userRole: UserRole): boolean {
    return ![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(userRole);
  }

  public static canAccessAllFacilities(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN;
  }

  public static async canAccessFacility(userId: string, userRole: UserRole, facilityId: string): Promise<boolean> {
    // Global admins can access any facility
    if (this.canAccessAllFacilities(userRole)) {
      return true;
    }

    // Check if user has association with this facility
    return UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
  }
}
