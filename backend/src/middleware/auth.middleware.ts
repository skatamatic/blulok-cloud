import { Response, NextFunction, RequestHandler } from 'express';
import { AuthService } from '@/services/auth.service';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { AppError } from '@/middleware/error.middleware';

export const authenticateToken: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new AppError('Access token is required', 401);
  }

  const decoded = AuthService.verifyToken(token);
  if (!decoded) {
    throw new AppError('Invalid or expired token', 401);
  }

  req.user = decoded;
  next();
};

export const requireRoles = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (!AuthService.hasPermission(req.user.role, roles)) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
};

export const requireAdmin: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!AuthService.isAdmin(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  next();
};

export const requireUserManagement: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!AuthService.canManageUsers(req.user.role)) {
    throw new AppError('User management permissions required', 403);
  }

  next();
};
