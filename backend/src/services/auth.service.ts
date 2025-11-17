import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { JWTPayload, LoginRequest, LoginResponse, CreateUserRequest, UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';

/**
 * Authentication Service
 *
 * Handles user authentication, authorization, and session management operations.
 * Provides secure credential validation and JWT token management.
 *
 * Key Features:
 * - Password hashing with bcrypt (12 salt rounds)
 * - JWT token generation and validation
 * - Account status verification
 * - Facility-scoped access control
 * - User creation and management
 * - Password change operations
 * - Comprehensive audit logging
 */
export class AuthService {
  /** Bcrypt salt rounds for password hashing (higher = more secure but slower) */
  private static readonly SALT_ROUNDS = 12;

  /**
   * Authenticate user credentials and generate JWT token.
   *
   * Validates user email/password, generates JWT token with user claims,
   * and determines device registration status.
   *
   * @param credentials - User login credentials (email/password)
   * @param deviceCtx - Optional device context for mobile app authentication
   * @returns Promise resolving to login response with JWT token or error details
   */
  public static async login(credentials: LoginRequest, deviceCtx?: { appDeviceId?: string | undefined; appPlatform?: string | undefined }): Promise<LoginResponse & { key_generation_required?: boolean }> {
    try {
      const { identifier, email, password } = credentials;
      // Determine the raw identifier: prefer explicit identifier, fallback to legacy email field
      const rawIdentifier = (identifier || email || '').trim();

      // Database connectivity check
      try {
        // Resolve user by identifier:
        // - if looks like email: prefer direct email match
        // - otherwise: normalize as phone (E.164) and match by phone_number
        const isEmail = rawIdentifier.includes('@');
        let user: User | undefined;
        if (isEmail) {
          const emailLower = rawIdentifier.toLowerCase();
          user = await UserModel.findByEmail(emailLower) as User | undefined;
        } else {
          const { toE164 } = await import('@/utils/phone.util');
          const phoneE164 = toE164(rawIdentifier);
          if (phoneE164) {
            user = await UserModel.findByPhone(phoneE164) as User | undefined;
          }
        }

        if (!user) {
          logger.warn(`Login attempt with invalid identifier: ${rawIdentifier}`);
          return {
            success: false,
            message: 'Invalid credentials'
          };
        }

        // Check if user is active
        if (!user.is_active) {
          logger.warn(`Login attempt with inactive account: ${rawIdentifier}`);
          return {
            success: false,
            message: 'Account is deactivated. Please contact administrator.'
          };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          logger.warn(`Login attempt with invalid password for identifier: ${rawIdentifier}`);
          return {
            success: false,
            message: 'Invalid credentials'
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

        // Detect new app device to flag key generation
        let keyGenerationRequired = false;
        try {
          const appDeviceId = deviceCtx?.appDeviceId;
          if (appDeviceId) {
            const { UserDeviceModel } = await import('@/models/user-device.model');
            const udm = new UserDeviceModel();
            const existing = await udm.findByUserAndAppDeviceId(user.id, appDeviceId);
            if (!existing) {
              keyGenerationRequired = true;
            }
          } else {
            // If user has never generated keys, also require
            const hasKeyStatusColumn = true; // added by migration
            if (hasKeyStatusColumn) {
              // naive check: treat absence as pending
              keyGenerationRequired = true;
            }
          }
        } catch (e) {
          // Non-fatal
          logger.warn('Device detection failed during login', e);
        }

        logger.info(`Successful login for user ${user.id} (${user.email ?? user.phone_number ?? 'no-email'})`);

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
          token,
          ...(keyGenerationRequired ? { key_generation_required: true } : {})
        };

      } catch (dbError) {
        logger.error(`Database error during login for identifier ${rawIdentifier}:`, dbError);
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
      const normalizedEmail = email.toLowerCase();
      const newUser = await UserModel.create({
        email: normalizedEmail,
        login_identifier: normalizedEmail,
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
