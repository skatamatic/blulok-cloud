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

/**
 * Require a single specific role
 */
export const requireRole = (role: UserRole): RequestHandler => {
  return requireRoles([role]);
};

/**
 * Require DEV_ADMIN role - consolidated from duplicate implementations
 */
export const requireDevAdmin: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== UserRole.DEV_ADMIN) {
    throw new AppError('Dev admin access required', 403);
  }

  next();
};

/**
 * Require TENANT role - consolidated from duplicate implementations
 */
export const requireTenant: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== UserRole.TENANT) {
    throw new AppError('Tenant access required', 403);
  }

  next();
};

/**
 * Require FACILITY_ADMIN role
 */
export const requireFacilityAdmin: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!AuthService.isFacilityAdmin(req.user.role)) {
    throw new AppError('Facility admin access required', 403);
  }

  next();
};

/**
 * Require ADMIN or FACILITY_ADMIN role - common pattern for facility operations
 */
export const requireAdminOrFacilityAdmin: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!AuthService.isAdmin(req.user.role) && !AuthService.isFacilityAdmin(req.user.role)) {
    throw new AppError('Admin or facility admin access required', 403);
  }

  next();
};

/**
 * Require any role except TENANT - for operations tenants cannot perform
 */
export const requireNotTenant: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role === UserRole.TENANT) {
    throw new AppError('This operation is not available for tenants', 403);
  }

  next();
};

/**
 * Require user management permissions OR allow self-access (for profile updates)
 * Moved from users.routes.ts to consolidate middleware
 */
export const requireUserManagementOrSelf = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  // Allow if user has management permissions OR is accessing their own profile
  const isSelfProfile = !!(req.params.id === req.user.userId);
  if (AuthService.canManageUsers(req.user.role) || isSelfProfile) {
    next();
  } else {
    throw new AppError('User management permissions required', 403);
  }
};

/**
 * Require access to a specific facility
 * Validates that the user has access to the facility specified in the request
 * @param facilityIdParam - Optional parameter name to look for facility ID (default: 'facilityId' or 'id')
 */
export const requireFacilityAccess = (facilityIdParam?: string | string[]): RequestHandler => {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // Global admins can access any facility
    if (AuthService.canAccessAllFacilities(req.user.role)) {
      next();
      return;
    }

    // Extract facility ID from params or query
    let facilityId: string | undefined;
    
    if (facilityIdParam) {
      if (Array.isArray(facilityIdParam)) {
        // Try multiple parameter names
        for (const param of facilityIdParam) {
          facilityId = req.params[param] || req.query[param] as string;
          if (facilityId) break;
        }
      } else {
        facilityId = req.params[facilityIdParam] || req.query[facilityIdParam] as string;
      }
    } else {
      // Default: try common parameter names
      facilityId = req.params.facilityId || req.params.id || req.query.facilityId as string || req.query.facility_id as string;
    }

    if (!facilityId) {
      throw new AppError('Facility ID is required', 400);
    }

    // Check if user has access to this facility
    const hasAccess = await AuthService.canAccessFacility(req.user.userId, req.user.role, facilityId);
    if (!hasAccess) {
      throw new AppError('Access denied to this facility', 403);
    }

    next();
  };
};

/**
 * Require facility-scoped role (not global admin)
 * Ensures user is facility-scoped and has facilityIds
 */
export const requireFacilityScope: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!AuthService.isFacilityScoped(req.user.role)) {
    throw new AppError('This operation requires facility-scoped access', 403);
  }

  if (!req.user.facilityIds || req.user.facilityIds.length === 0) {
    throw new AppError('No facility access assigned', 403);
  }

  next();
};

/**
 * Helper to extract facility filters for queries
 * Returns facility IDs that should be used for filtering, or undefined if global admin
 */
export const applyFacilityScope = (req: AuthenticatedRequest): string[] | undefined => {
  if (!req.user) {
    return undefined;
  }

  // Global admins can see all facilities (return undefined = no filter)
  if (AuthService.canAccessAllFacilities(req.user.role)) {
    return undefined;
  }

  // Facility-scoped users only see their assigned facilities
  return req.user.facilityIds || [];
};