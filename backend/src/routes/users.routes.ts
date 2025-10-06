import { Router, Response, NextFunction } from 'express';
import Joi from 'joi';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import { UserRole, CreateUserRequest, UpdateUserRequest, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler, AppError } from '@/middleware/error.middleware';
import { authenticateToken, requireUserManagement } from '@/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken as any);

// Helper function to check if user is accessing their own profile
const isSelfProfile = (req: AuthenticatedRequest): boolean => {
  return !!(req.user && req.params.id === req.user.userId);
};

// Helper function to check if user has management permissions or is accessing their own profile
const requireUserManagementOrSelf = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  // Allow if user has management permissions OR is accessing their own profile
  if (AuthService.canManageUsers(req.user.role) || isSelfProfile(req)) {
    next();
  } else {
    throw new AppError('User management permissions required', 403);
  }
};

// Helper function to check facility access for facility admins
const checkFacilityAccess = async (req: AuthenticatedRequest, targetUserId: string): Promise<boolean> => {
  if (!req.user) return false;
  
  // Global admins can access all users
  if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.DEV_ADMIN) {
    return true;
  }
  
  // Facility admins can only access users in their facilities
  if (req.user.role === UserRole.FACILITY_ADMIN) {
    if (!req.user.facilityIds || req.user.facilityIds.length === 0) {
      return false;
    }
    
    // Get the target user's facility associations
    const targetUserFacilities = await UserFacilityAssociationModel.getUserFacilityIds(targetUserId);
    
    // Check if any of the target user's facilities are in the admin's facilities
    return targetUserFacilities.some(facilityId => req.user!.facilityIds!.includes(facilityId));
  }
  
  // Other roles can only access their own profile
  return req.user.userId === targetUserId;
};

// Validation schemas
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    }),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  role: Joi.string().valid(...Object.values(UserRole)).required()
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  isActive: Joi.boolean().optional()
});

// GET /users - List all users with filtering and facility information
router.get('/', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { search, role, facility, sortBy = 'created_at', sortOrder = 'desc', limit, offset } = req.query;

  // Get users with facility information
  const usersWithFacilities = await UserFacilityAssociationModel.getUsersWithFacilities();
  
  let filteredUsers = usersWithFacilities;

  // Apply search filter
  if (search) {
    const searchTerm = String(search).toLowerCase();
    filteredUsers = filteredUsers.filter(user => 
      user.first_name.toLowerCase().includes(searchTerm) ||
      user.last_name.toLowerCase().includes(searchTerm) ||
      user.email.toLowerCase().includes(searchTerm) ||
      (user.facility_names && user.facility_names.toLowerCase().includes(searchTerm))
    );
  }

  // Apply role filter
  if (role) {
    filteredUsers = filteredUsers.filter(user => user.role === role);
  }

  // Apply facility filter
  if (facility) {
    filteredUsers = filteredUsers.filter(user => {
      // Handle users with no facility associations (facility_ids is null)
      if (!user.facility_ids) {
        return false;
      }
      // Split the comma-separated facility IDs and check if the selected facility is included
      const userFacilityIds = user.facility_ids.split(',').map((id: string) => id.trim());
      return userFacilityIds.includes(String(facility));
    });
  }

  // Apply sorting
  filteredUsers.sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy) {
      case 'name':
        aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
        bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
        break;
      case 'email':
        aVal = a.email.toLowerCase();
        bVal = b.email.toLowerCase();
        break;
      case 'role':
        aVal = a.role;
        bVal = b.role;
        break;
      case 'created_at':
      default:
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
    }
    
    if (sortOrder === 'desc') {
      return aVal < bVal ? 1 : -1;
    } else {
      return aVal > bVal ? 1 : -1;
    }
  });

  // If requester is facility admin, filter to only show users from their facilities
  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    const requesterFacilityIds = req.user!.facilityIds || [];
    filteredUsers = filteredUsers.filter(user => {
      // Always show global admins
      if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
        return true;
      }
      // Show users who share at least one facility
      if (user.facility_ids) {
        const userFacilityIds = user.facility_ids.split(',');
        return userFacilityIds.some((id: string) => requesterFacilityIds.includes(id));
      }
      return false;
    });
  }

  // Apply pagination
  const total = filteredUsers.length;
  const limitNum = limit ? parseInt(limit as string) : 20;
  const offsetNum = offset ? parseInt(offset as string) : 0;
  
  const paginatedUsers = filteredUsers.slice(offsetNum, offsetNum + limitNum);

  const sanitizedUsers = paginatedUsers.map(user => ({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    isActive: user.is_active,
    lastLogin: user.last_login,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    facilityNames: user.facility_names ? user.facility_names.split(',') : [],
    facilityIds: user.facility_ids ? user.facility_ids.split(',') : []
  }));

  res.json({
    success: true,
    users: sanitizedUsers,
    total: total
  });
}));

// GET /users/:id - Get user by ID
router.get('/:id', requireUserManagementOrSelf, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }
  
  // Check facility access for facility admins
  const hasAccess = await checkFacilityAccess(req, id);
  if (!hasAccess) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this user'
    });
    return;
  }
  
  const user = await UserModel.findById(id) as User;

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }
  });
}));

// POST /users - Create new user
router.post('/', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const userData: CreateUserRequest = value;
  
  // Only dev_admin can create other dev_admin users
  if (userData.role === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Only dev_admin can create dev_admin users'
    });
    return;
  }

  const result = await AuthService.createUser(userData);
  const statusCode = result.success ? 201 : 400;
  res.status(statusCode).json(result);
}));

// PUT /users/:id - Update user
router.put('/:id', requireUserManagementOrSelf, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }
  
  // Check facility access for facility admins
  const hasAccess = await checkFacilityAccess(req, id);
  if (!hasAccess) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this user'
    });
    return;
  }
  
  const { error, value } = updateUserSchema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const updateData: UpdateUserRequest = value;

  // Check if user exists
  const existingUser = await UserModel.findById(id) as User;
  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Only dev_admin can modify dev_admin users or assign dev_admin role
  if ((existingUser.role === UserRole.DEV_ADMIN || updateData.role === UserRole.DEV_ADMIN) && req.user!.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Only dev_admin can modify dev_admin users'
    });
    return;
  }

  // For self-updates, restrict what can be modified
  if (id === req.user!.userId) {
    // Users can only update their own firstName and lastName, not role or isActive
    if (updateData.role !== undefined || updateData.isActive !== undefined) {
      res.status(400).json({
        success: false,
        message: 'You cannot modify your own role or active status'
      });
      return;
    }
  }

  // Update user
  const updatedUser = await UserModel.updateById(id, {
    first_name: updateData.firstName,
    last_name: updateData.lastName,
    role: updateData.role,
    is_active: updateData.isActive
  }) as User;

  res.json({
    success: true,
    message: 'User updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      role: updatedUser.role,
      isActive: updatedUser.is_active,
      lastLogin: updatedUser.last_login,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at
    }
  });
}));

// DELETE /users/:id - Deactivate user (soft delete)
router.delete('/:id', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  // Check facility access for facility admins
  const hasAccess = await checkFacilityAccess(req, id);
  if (!hasAccess) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this user'
    });
    return;
  }

  // Check if user exists
  const existingUser = await UserModel.findById(id) as User;
  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Only dev_admin can deactivate dev_admin users
  if (existingUser.role === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Only dev_admin can deactivate dev_admin users'
    });
    return;
  }

  // Prevent users from deactivating themselves
  if (id === req.user!.userId) {
    res.status(400).json({
      success: false,
      message: 'Cannot deactivate your own account'
    });
    return;
  }

  await UserModel.deactivateUser(id);

  res.json({
    success: true,
    message: 'User deactivated successfully'
  });
}));

// POST /users/:id/activate - Reactivate user
router.post('/:id/activate', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  // Check facility access for facility admins
  const hasAccess = await checkFacilityAccess(req, id);
  if (!hasAccess) {
    res.status(403).json({
      success: false,
      message: 'Access denied to this user'
    });
    return;
  }

  // Check if user exists
  const existingUser = await UserModel.findById(id) as User;
  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Only dev_admin can activate dev_admin users
  if (existingUser.role === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Only dev_admin can activate dev_admin users'
    });
    return;
  }

  await UserModel.activateUser(id);

  res.json({
    success: true,
    message: 'User activated successfully'
  });
}));

export { router as usersRouter };
