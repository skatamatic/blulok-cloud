import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { loginLimiter } from '@/middleware/security-limits';
import { AuthService } from '@/services/auth.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { LoginRequest, AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { UserModel, User } from '@/models/user.model';
import { FacilityAccessService } from '@/services/facility-access.service';
import { logger } from '@/utils/logger';
import { RateLimitBypassService } from '@/services/rate-limit-bypass.service';
import { registerGet, registerPost } from '@/openapi/register-route';
import {
  loginSchema,
  changePasswordSchema,
  inviteAcceptSchema,
  inviteRequestOtpSchema,
  inviteVerifyOtpSchema,
  inviteSetPasswordSchema,
  forgotPasswordRequestSchema,
  forgotPasswordVerifySchema,
  forgotPasswordResetSchema,
} from '@/schemas/auth.schemas';

/**
 * Authentication Routes
 *
 * Handles user authentication, authorization, and session management for the BluLok system.
 * Provides secure login/logout functionality with JWT-based session tokens.
 *
 * Key Features:
 * - User authentication with email/password
 * - JWT token generation and validation
 * - Password change functionality
 * - Session management and logout
 * - Comprehensive input validation
 * - Rate limiting protection
 *
 * Authentication Flow:
 * 1. User submits credentials via POST /auth/login
 * 2. Credentials validated against database
 * 3. JWT token generated with user claims and roles
 * 4. Token returned for subsequent API calls
 * 5. Token validated on protected routes via middleware
 *
 * Security Considerations:
 * - Password complexity requirements
 * - JWT token expiration and refresh
 * - Rate limiting to prevent brute force attacks
 * - Secure password hashing (bcrypt)
 * - Input sanitization and validation
 * - Audit logging for authentication events
 * - Session timeout and automatic logout
 *
 * API Endpoints:
 * - POST /auth/login - User authentication
 * - POST /auth/logout - Session termination
 * - POST /auth/change-password - Password update
 * - GET /auth/profile - Current user profile
 * - GET /auth/verify-token - Token validation
 * - POST /auth/refresh-token - Refresh JWT token with fresh user data
 */

const router = Router();
const MOUNT = '/api/v1/auth';

// Strict rate limiters for invite/OTP endpoints (wrapped so dev bypass can opt out)
const inviteRequestLimiterRaw = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const inviteVerifyLimiterRaw = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const bypassSvc = RateLimitBypassService.getInstance();

function profileUserPayload(
  req: AuthenticatedRequest,
  extras?: { simplifiedUi?: boolean },
) {
  const user = req.user!;
  const facilityIds = AuthService.canAccessAllFacilities(user.role)
    ? []
    : (user.facilityIds ?? []);
  return {
    id: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    facilityIds,
    simplifiedUi: Boolean(extras?.simplifiedUi),
  };
}

async function loadSimplifiedUiFlag(userId: string): Promise<boolean> {
  try {
    const row = await UserModel.findById(userId) as User | undefined;
    return Boolean(row?.simplified_ui);
  } catch {
    return false;
  }
}

const inviteRequestLimiter: typeof inviteRequestLimiterRaw = ((req: Request, res: Response, next: any) => {
  if (bypassSvc.shouldBypass(req)) return next();
  return inviteRequestLimiterRaw(req, res, next);
}) as any;

const inviteVerifyLimiter: typeof inviteVerifyLimiterRaw = ((req: Request, res: Response, next: any) => {
  if (bypassSvc.shouldBypass(req)) return next();
  return inviteVerifyLimiterRaw(req, res, next);
}) as any;

registerPost(
  router,
  '/login',
  {
    openApiPath: `${MOUNT}/login`,
    tags: ['Auth'],
    summary: 'User authentication',
    security: 'none',
    body: loginSchema,
  },
  loginLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const loginData: LoginRequest = req.body;
    const appDeviceId = (req.headers['x-app-device-id'] as string | undefined)?.trim();
    const appPlatform = (req.headers['x-app-platform'] as string | undefined)?.trim();

    const result = await AuthService.login(loginData, {
      appDeviceId: appDeviceId || undefined,
      appPlatform: appPlatform || undefined,
    });

    const statusCode = result.success ? 200 : 401;
    if (result.success) {
      let isDeviceRegistered = false;
      try {
        const headerAppDeviceId = (req.headers['x-app-device-id'] as string | undefined)?.trim();
        if (headerAppDeviceId) {
          const { UserDeviceModel } = await import('@/models/user-device.model');
          const udm = new UserDeviceModel();
          const device = await udm.findActiveByUserAndAppDeviceId(result.user!.id, headerAppDeviceId);
          isDeviceRegistered = !!device;
        }
      } catch (_e) {}
      let ops_public_key: string | undefined;
      let ops_public_key_jwk: { kty: string; crv: string; x: string } | undefined;
      let ops_public_key_pem: string | undefined;
      try {
        ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem();
        ops_public_key = Ed25519Service.getOpsPublicKeyB64();
        ops_public_key_jwk = Ed25519Service.getOpsPublicKeyJwk();
      } catch (_e) {}
      res.status(statusCode).json({ ...result, isDeviceRegistered, ops_public_key, ops_public_key_jwk, ops_public_key_pem });
    } else {
      res.status(statusCode).json(result);
    }
  }),
);

registerPost(
  router,
  '/change-password',
  {
    openApiPath: `${MOUNT}/change-password`,
    tags: ['Auth'],
    summary: 'Change password for authenticated user',
    security: 'bearer',
    body: changePasswordSchema,
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(req.user!.userId, currentPassword, newPassword);

    const statusCode = result.success ? 200 : 400;
    if (!result.success) {
      logger.error('Change password failed', {
        requester: req.user?.userId,
        role: req.user?.role,
        reason: result.message,
      });
    } else {
      logger.info('Password changed', {
        requester: req.user?.userId,
        role: req.user?.role,
      });
    }
    res.status(statusCode).json(result);
  }),
);

registerGet(
  router,
  '/profile',
  {
    openApiPath: `${MOUNT}/profile`,
    tags: ['Auth'],
    summary: 'Get current user profile',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const simplifiedUi = await loadSimplifiedUiFlag(req.user!.userId);
    res.json({
      success: true,
      user: profileUserPayload(req, { simplifiedUi }),
    });
  }),
);

registerPost(
  router,
  '/logout',
  {
    openApiPath: `${MOUNT}/logout`,
    tags: ['Auth'],
    summary: 'Terminate current session',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.json({
      success: true,
      message: 'Logout successful',
    });
  }),
);

registerGet(
  router,
  '/verify-token',
  {
    openApiPath: `${MOUNT}/verify-token`,
    tags: ['Auth'],
    summary: 'Verify JWT token validity',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const simplifiedUi = await loadSimplifiedUiFlag(req.user!.userId);
    res.json({
      success: true,
      message: 'Token is valid',
      user: profileUserPayload(req, { simplifiedUi }),
    });
  }),
);

registerPost(
  router,
  '/refresh-token',
  {
    openApiPath: `${MOUNT}/refresh-token`,
    tags: ['Auth'],
    summary: 'Refresh JWT token with fresh user data',
    security: 'bearer',
  },
  authenticateToken as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const user = await UserModel.findById(userId) as User | undefined;
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({
          success: false,
          message: 'Account is deactivated',
        });
        return;
      }

      let facilityIds: string[] = [];
      if (AuthService.isFacilityScoped(user.role as UserRole)) {
        facilityIds = await FacilityAccessService.getUserFacilityIds(user.id, user.role as UserRole);
      }

      const newToken = AuthService.generateToken(user, facilityIds);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        token: newToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role as UserRole,
          facilityIds,
          simplifiedUi: Boolean(user.simplified_ui),
        },
      });
    } catch (error) {
      logger.error('Error refreshing token:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while refreshing token',
      });
    }
  }),
);

// ----- First-time Invite Flow Endpoints -----

registerPost(
  router,
  '/invite/accept',
  {
    openApiPath: `${MOUNT}/invite/accept`,
    tags: ['Auth'],
    summary: 'Validate invite token and return profile info',
    security: 'none',
    body: inviteAcceptSchema,
  },
  inviteVerifyLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { FirstTimeUserService } = await import('@/services/first-time-user.service');
    const svc = FirstTimeUserService.getInstance();
    try {
      const result = await svc.acceptInvite({ token: req.body.token });
      res.json({
        success: true,
        needs_profile: result.needs_profile,
        profile: result.profile,
        missing_fields: result.missing_fields,
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || 'Invalid invite token' });
    }
  }),
);

registerPost(
  router,
  '/invite/request-otp',
  {
    openApiPath: `${MOUNT}/invite/request-otp`,
    tags: ['Auth'],
    summary: 'Request OTP for first-time invite login',
    security: 'none',
    body: inviteRequestOtpSchema,
  },
  inviteRequestLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { FirstTimeUserService } = await import('@/services/first-time-user.service');
    const svc = FirstTimeUserService.getInstance();
    try {
      const result = await svc.requestOtp({
        token: req.body.token,
        phone: req.body.phone,
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
      });
      res.json({
        success: true,
        expiresAt: result.expiresAt,
        userId: result.userId,
        inviteId: result.inviteId,
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || 'Unable to request OTP' });
    }
  }),
);

registerPost(
  router,
  '/invite/verify-otp',
  {
    openApiPath: `${MOUNT}/invite/verify-otp`,
    tags: ['Auth'],
    summary: 'Verify OTP for invite flow',
    security: 'none',
    body: inviteVerifyOtpSchema,
  },
  inviteVerifyLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { FirstTimeUserService } = await import('@/services/first-time-user.service');
    const svc = FirstTimeUserService.getInstance();
    try {
      const valid = await svc.verifyOtp({ token: req.body.token, otp: req.body.otp });
      res.json({ success: valid });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || 'Invalid OTP' });
    }
  }),
);

registerPost(
  router,
  '/invite/set-password',
  {
    openApiPath: `${MOUNT}/invite/set-password`,
    tags: ['Auth'],
    summary: 'Set password and complete invite onboarding',
    security: 'none',
    body: inviteSetPasswordSchema,
  },
  inviteVerifyLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { FirstTimeUserService } = await import('@/services/first-time-user.service');
    const svc = FirstTimeUserService.getInstance();
    try {
      await svc.setPassword({
        token: req.body.token,
        otp: req.body.otp,
        newPassword: req.body.newPassword,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || 'Unable to set password' });
    }
  }),
);

// ----- Forgot Password / Password Reset Flow -----

const passwordResetRequestLimiterRaw = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
});

const passwordResetResetLimiterRaw = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset attempts. Please try again later.' },
});

const passwordResetRequestLimiter: typeof passwordResetRequestLimiterRaw = ((req: Request, res: Response, next: any) => {
  if (bypassSvc.shouldBypass(req)) return next();
  return passwordResetRequestLimiterRaw(req, res, next);
}) as any;

const passwordResetResetLimiter: typeof passwordResetResetLimiterRaw = ((req: Request, res: Response, next: any) => {
  if (bypassSvc.shouldBypass(req)) return next();
  return passwordResetResetLimiterRaw(req, res, next);
}) as any;

registerPost(
  router,
  '/forgot-password/request',
  {
    openApiPath: `${MOUNT}/forgot-password/request`,
    tags: ['Auth'],
    summary: 'Request password reset link',
    security: 'none',
    body: forgotPasswordRequestSchema,
  },
  passwordResetRequestLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { PasswordResetService } = await import('@/services/password-reset.service');
    const svc = PasswordResetService.getInstance();

    try {
      const result = await svc.requestReset({ email: req.body.email, phone: req.body.phone });
      res.json({
        success: true,
        expiresAt: result.expiresAt,
        deliveryMethod: result.deliveryMethod,
      });
    } catch (e: any) {
      if (e.message?.includes('If an account exists')) {
        res.json({ success: true, message: 'If an account exists with this information, you will receive a reset link' });
      } else {
        res.status(400).json({ success: false, message: e?.message || 'Unable to process request' });
      }
    }
  }),
);

registerPost(
  router,
  '/forgot-password/verify',
  {
    openApiPath: `${MOUNT}/forgot-password/verify`,
    tags: ['Auth'],
    summary: 'Verify password reset token',
    security: 'none',
    body: forgotPasswordVerifySchema,
  },
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { PasswordResetService } = await import('@/services/password-reset.service');
    const svc = PasswordResetService.getInstance();

    const result = await svc.verifyToken(req.body.token);
    if (!result.valid) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
      return;
    }

    res.json({
      success: true,
      email: result.email,
    });
  }),
);

registerPost(
  router,
  '/forgot-password/reset',
  {
    openApiPath: `${MOUNT}/forgot-password/reset`,
    tags: ['Auth'],
    summary: 'Reset password using token',
    security: 'none',
    body: forgotPasswordResetSchema,
  },
  passwordResetResetLimiter,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { PasswordResetService } = await import('@/services/password-reset.service');
    const svc = PasswordResetService.getInstance();

    try {
      await svc.resetPassword({
        token: req.body.token,
        newPassword: req.body.newPassword,
      });
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || 'Unable to reset password' });
    }
  }),
);

export { router as authRouter };
