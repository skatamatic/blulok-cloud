import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { loginLimiter } from '@/middleware/security-limits';
import Joi from 'joi';
import { AuthService } from '@/services/auth.service';
import { LoginRequest, AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { InviteService } from '@/services/invite.service';
import { OTPService } from '@/services/otp.service';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { logger } from '@/utils/logger';
import bcrypt from 'bcrypt';

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
// Strict rate limiters for invite/OTP endpoints
const inviteRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const inviteVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation schemas with security constraints
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).+$'))
    .required()
    .messages({
      'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character'
    })
});

// POST /auth/login - User authentication endpoint
router.post('/login', loginLimiter, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const loginData: LoginRequest = value;
  // Extract app device headers if provided
  const appDeviceId = (req.headers['x-app-device-id'] as string | undefined)?.trim();
  const appPlatform = (req.headers['x-app-platform'] as string | undefined)?.trim();

  const result = await AuthService.login(loginData, {
    appDeviceId: appDeviceId || undefined,
    appPlatform: appPlatform || undefined
  });

  const statusCode = result.success ? 200 : 401;
  if (result.success) {
    // Compute isDeviceRegistered: check if the provided appDeviceId exists
    let isDeviceRegistered = false;
    try {
      const appDeviceId = (req.headers['x-app-device-id'] as string | undefined)?.trim();
      if (appDeviceId) {
        const { UserDeviceModel } = await import('@/models/user-device.model');
        const udm = new UserDeviceModel();
        const device = await udm.findByUserAndAppDeviceId(result.user!.id, appDeviceId);
        isDeviceRegistered = !!device;
      }
    } catch (_e) {}
    res.status(statusCode).json({ ...result, isDeviceRegistered });
  } else {
    res.status(statusCode).json(result);
  }
}));

// POST /auth/change-password
router.post('/change-password', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    logger.error('Change password validation failed', {
      requester: req.user?.userId,
      role: req.user?.role,
      message: error.details[0]?.message,
    });
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const { currentPassword, newPassword } = value;
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
}));

// GET /auth/profile
router.get('/profile', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    user: {
      id: req.user!.userId,
      email: req.user!.email,
      firstName: req.user!.firstName,
      lastName: req.user!.lastName,
      role: req.user!.role
    }
  });
}));

// POST /auth/logout
router.post('/logout', authenticateToken as any, asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  // In a more sophisticated setup, you might want to blacklist the token
  // For now, we'll just return success and let the client handle token removal
  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

// GET /auth/verify-token
router.get('/verify-token', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user!.userId,
      email: req.user!.email,
      firstName: req.user!.firstName,
      lastName: req.user!.lastName,
      role: req.user!.role
    }
  });
}));

// POST /auth/refresh-token - Refresh user's JWT token
router.post('/refresh-token', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    
    // Fetch fresh user data from database
    const user = await UserModel.findById(userId) as User | undefined;
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Check if user is still active
    if (!user.is_active) {
      res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
      return;
    }

    // Get fresh facility associations if user is facility-scoped
    let facilityIds: string[] = [];
    if (AuthService.isFacilityScoped(user.role as UserRole)) {
      facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(user.id);
    }

    // Generate new token with fresh user data
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
        role: user.role as UserRole
      }
    });
  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while refreshing token'
    });
  }
}));

export { router as authRouter };

// ----- First-time Invite Flow Endpoints -----

// POST /auth/invite/request-otp { token, phone? | email? }
router.post('/invite/request-otp', inviteRequestLimiter, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const schema = Joi.object({
    token: Joi.string().required(),
    phone: Joi.string().optional(),
    email: Joi.string().email().optional(),
  }).xor('phone', 'email');
  const { error, value } = schema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const { FirstTimeUserService } = await import('@/services/first-time-user.service');
  const svc = FirstTimeUserService.getInstance();
  try {
    const result = await svc.requestOtp({ token: value.token, phone: value.phone, email: value.email });
    res.json({ success: true, expiresAt: result.expiresAt });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || 'Unable to send OTP' });
  }
}));

// POST /auth/invite/verify-otp { token, otp }
router.post('/invite/verify-otp', inviteVerifyLimiter, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const schema = Joi.object({ token: Joi.string().required(), otp: Joi.string().pattern(/^\d{6}$/).required() });
  const { error, value } = schema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const { FirstTimeUserService } = await import('@/services/first-time-user.service');
  const svc = FirstTimeUserService.getInstance();
  try {
    const valid = await svc.verifyOtp({ token: value.token, otp: value.otp });
    res.json({ success: valid });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || 'Invalid OTP' });
  }
}));

// POST /auth/invite/set-password { token, otp, newPassword }
router.post('/invite/set-password', inviteVerifyLimiter, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const schema = Joi.object({
    token: Joi.string().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).+$'))
      .required()
      .messages({ 'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character' })
  });
  const { error, value } = schema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
    return;
  }

  const { FirstTimeUserService } = await import('@/services/first-time-user.service');
  const svc = FirstTimeUserService.getInstance();
  try {
    await svc.setPassword({ token: value.token, otp: value.otp, newPassword: value.newPassword });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || 'Unable to set password' });
  }
}));
