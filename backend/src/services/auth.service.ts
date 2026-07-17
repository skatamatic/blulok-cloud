import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserModel, User } from '@/models/user.model';
import { FacilityAccessService } from '@/services/facility-access.service';
import {
  JWTPayload,
  LoginRequest,
  LoginResponse,
  CreateUserRequest,
  CreateUserOptions,
  CreateUserResult,
  InactiveUserSummary,
  UserRole,
} from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { toE164 } from '@/utils/phone.util';

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
      const rawLoginIdentifier = (credentials.identifier || credentials.email || '').trim();
      const loginIdentifier = rawLoginIdentifier.toLowerCase();
      const { password } = credentials;

      if (!loginIdentifier) {
        return {
          success: false,
          message: 'Email or phone is required'
        };
      }

      // Database connectivity check
      try {
        const identifierCandidates = [loginIdentifier];
        const normalizedPhone = toE164(rawLoginIdentifier, 'US').toLowerCase();
        if (normalizedPhone && !identifierCandidates.includes(normalizedPhone)) {
          identifierCandidates.push(normalizedPhone);
        }

        let user: User | undefined;
        for (const candidate of identifierCandidates) {
          user = await UserModel.findByLoginIdentifier(candidate);
          if (user) break;
        }

        // Backward compatibility for any users missing login_identifier.
        if (!user && loginIdentifier.includes('@')) {
          user = await UserModel.findByEmail(loginIdentifier);
        }

        if (!user) {
          logger.warn(`Login attempt with invalid identifier: ${loginIdentifier}`);
          return {
            success: false,
            message: 'Invalid email or password'
          };
        }

        // Check if user is active
        if (!user.is_active) {
          logger.warn(`Login attempt with inactive account: ${loginIdentifier}`);
          return {
            success: false,
            message: 'Account is deactivated. Please contact administrator.'
          };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          logger.warn(`Login attempt with invalid password: ${loginIdentifier}`);
          return {
            success: false,
            message: 'Invalid email or password'
          };
        }

        // Update last login (ignore errors)
        try {
          await UserModel.updateLastLogin(user.id);
        } catch (updateError) {
          logger.warn(`Failed to update last login for ${loginIdentifier}:`, updateError);
        }

        // Embed live facility scope in JWT (REST/WS re-hydrate from DB on each request)
        let facilityIds: string[] = [];
        if (this.isFacilityScoped(user.role as UserRole)) {
          const { FacilityAccessService } = await import('@/services/facility-access.service');
          facilityIds = await FacilityAccessService.getUserFacilityIds(user.id, user.role as UserRole);
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
            // Revoked devices should re-register and regenerate keys.
            const existing = await udm.findActiveByUserAndAppDeviceId(user.id, appDeviceId);
            if (!existing) {
              keyGenerationRequired = true;
            }
          } else {
            // No X-App-Device-Id: web dashboards, gateway simulators, and admin tools are not
            // mobile key onboarding clients — do not force key_generation_required for those roles.
            // (Legacy users.key_status was removed; the previous "always true" branch broke gateway login UX.)
            const role = user.role as UserRole;
            if (
              role === UserRole.FACILITY_ADMIN ||
              role === UserRole.ADMIN ||
              role === UserRole.DEV_ADMIN
            ) {
              keyGenerationRequired = false;
            } else {
              // Tenant / maintenance without device context may still need mobile key registration
              keyGenerationRequired = true;
            }
          }
        } catch (e) {
          // Non-fatal
          logger.warn('Device detection failed during login', e);
        }

        logger.info(`Successful login: ${loginIdentifier}`);

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
        logger.error(`Database error during login for ${loginIdentifier}:`, dbError);
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

  private static toInactiveUserSummary(user: User): InactiveUserSummary {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      phoneNumber: user.phone_number ?? null,
    };
  }

  private static inactiveConflictResult(
    user: User,
    matchedBy: 'email' | 'phone',
  ): CreateUserResult {
    const identity = matchedBy === 'email' ? 'email' : 'phone number';
    return {
      success: false,
      code: 'USER_INACTIVE',
      message: `An inactive user with this ${identity} already exists. Confirm to reactivate and update their profile.`,
      inactiveUser: this.toInactiveUserSummary(user),
    };
  }

  /**
   * Create a user, or reactivate an inactive account when confirmed.
   *
   * Inactive email/phone collisions return `code: USER_INACTIVE` (unless
   * `reactivateIfInactive` is set). Active collisions remain hard errors.
   */
  public static async createUser(
    userData: CreateUserRequest,
    options: CreateUserOptions = {},
  ): Promise<CreateUserResult> {
    try {
      const { email, password, firstName, lastName, role, phoneNumber } = userData;
      const reactivateIfInactive = Boolean(options.reactivateIfInactive);
      const normalizedEmail = email.toLowerCase();

      let normalizedPhone: string | null = null;
      const rawPhone = phoneNumber != null ? String(phoneNumber).trim() : '';
      if (rawPhone) {
        normalizedPhone = toE164(rawPhone, 'US');
        if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
          return {
            success: false,
            message: 'Invalid phone number',
          };
        }
      }

      const emailOwner = await UserModel.findByEmail(normalizedEmail);
      const phoneOwner = normalizedPhone
        ? await UserModel.findByPhone(normalizedPhone)
        : undefined;

      if (
        emailOwner &&
        phoneOwner &&
        emailOwner.id !== phoneOwner.id
      ) {
        return {
          success: false,
          code: 'IDENTITY_CONFLICT',
          message: 'Email and phone belong to different existing users',
        };
      }

      if (emailOwner?.is_active) {
        return {
          success: false,
          message: 'User with this email already exists',
        };
      }

      if (phoneOwner?.is_active && (!emailOwner || phoneOwner.id !== emailOwner.id)) {
        return {
          success: false,
          message: 'Phone number already in use',
        };
      }

      const inactiveCandidate = !emailOwner?.is_active && emailOwner
        ? emailOwner
        : !phoneOwner?.is_active && phoneOwner
          ? phoneOwner
          : undefined;

      if (inactiveCandidate) {
        if (!reactivateIfInactive) {
          return this.inactiveConflictResult(
            inactiveCandidate,
            emailOwner?.id === inactiveCandidate.id ? 'email' : 'phone',
          );
        }

        return this.reactivateInactiveUser(inactiveCandidate, {
          normalizedEmail,
          normalizedPhone,
          password,
          firstName,
          lastName,
          role,
        });
      }

      const trimmedPassword = typeof password === 'string' ? password.trim() : '';
      const hasPassword = trimmedPassword.length > 0;

      let passwordHash: string;
      let requiresPasswordReset: boolean;
      if (hasPassword) {
        passwordHash = await bcrypt.hash(trimmedPassword, this.SALT_ROUNDS);
        requiresPasswordReset = false;
      } else {
        // Matches key-sharing / phone-only provisional accounts: bcrypt never succeeds until set via invite flow.
        passwordHash = '!';
        requiresPasswordReset = true;
      }

      const newUser = await UserModel.create({
        email: normalizedEmail,
        login_identifier: normalizedEmail,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role,
        is_active: true,
        ...(normalizedPhone ? { phone_number: normalizedPhone } : {}),
        requires_password_reset: requiresPasswordReset,
      }) as User;

      logger.info(`User created: ${email} with role ${role}`);

      return {
        success: true,
        message: 'User created successfully',
        userId: newUser.id,
      };
    } catch (error) {
      logger.error(`Create user error: ${error}`);
      return {
        success: false,
        message: 'An error occurred while creating user',
      };
    }
  }

  private static async reactivateInactiveUser(
    existing: User,
    fields: {
      normalizedEmail: string;
      normalizedPhone: string | null;
      password?: string;
      firstName: string;
      lastName: string;
      role: UserRole;
    },
  ): Promise<CreateUserResult> {
    const trimmedPassword =
      typeof fields.password === 'string' ? fields.password.trim() : '';
    const hasPassword = trimmedPassword.length > 0;

    const updates: Record<string, unknown> = {
      email: fields.normalizedEmail,
      login_identifier: fields.normalizedEmail,
      first_name: fields.firstName,
      last_name: fields.lastName,
      role: fields.role,
      is_active: true,
    };

    if (hasPassword) {
      updates.password_hash = await bcrypt.hash(trimmedPassword, this.SALT_ROUNDS);
      updates.requires_password_reset = false;
    } else {
      // Same provisional semantics as create without a password (invite / first-time flow).
      updates.password_hash = '!';
      updates.requires_password_reset = true;
    }

    await UserModel.updateById(existing.id, updates);

    if (fields.normalizedPhone) {
      await UserModel.setPhoneNumber(existing.id, fields.normalizedPhone);
    }

    // Ensure model hooks run for status_change (denylist / related listeners).
    await UserModel.activateUser(existing.id);

    logger.info(
      `Inactive user reactivated: ${fields.normalizedEmail} (id=${existing.id}) with role ${fields.role}`,
    );

    return {
      success: true,
      message: 'User reactivated successfully',
      userId: existing.id,
      reactivated: true,
    };
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

    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] });
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
    return FacilityAccessService.hasAccessToFacility(userId, userRole, facilityId);
  }
}
