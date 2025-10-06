import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { AuthService } from '@/services/auth.service';
import { LoginRequest, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';

const router = Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]+$')).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    })
});

// POST /auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const loginData: LoginRequest = value;
  const result = await AuthService.login(loginData);

  const statusCode = result.success ? 200 : 401;
  res.status(statusCode).json(result);
}));

// POST /auth/change-password
router.post('/change-password', authenticateToken as any, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const { currentPassword, newPassword } = value;
  const result = await AuthService.changePassword(req.user!.userId, currentPassword, newPassword);

  const statusCode = result.success ? 200 : 400;
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

export { router as authRouter };
