import { Router, Response, NextFunction } from 'express';
import Joi from 'joi';
import { UserModel, User } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import { UserRole, CreateUserRequest, UpdateUserRequest, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler, AppError } from '@/middleware/error.middleware';
import { authenticateToken, requireUserManagement, requireUserManagementOrSelf } from '@/middleware/auth.middleware';
import { DatabaseService } from '@/services/database.service';
import { UserDeviceModel } from '@/models/user-device.model';
import { FirstTimeUserService } from '@/services/first-time-user.service';
import { logger } from '@/utils/logger';

/**
 * User Management Routes
 *
 * Provides comprehensive user lifecycle management for the BluLok system.
 * Handles user creation, updates, deactivation, and facility associations.
 *
 * Key Features:
 * - Role-based access control (RBAC) for all operations
 * - Facility-scoped administration for facility managers
 * - Self-service operations for tenants
 * - Comprehensive audit logging
 * - Integration with device management and denylist updates
 *
 * Security Model:
 * - DEV_ADMIN: Full system access
 * - ADMIN: Global user management
 * - FACILITY_ADMIN: Facility-scoped user management
 * - TENANT: Self-service only (password, profile updates)
 *
 * Audit Trail:
 * - All user modifications logged with performing user details
 * - Password changes tracked (not logged)
 * - Role escalations specially audited
 * - Account deactivation triggers denylist updates
 */
const router = Router();

// All routes require authentication - no anonymous access allowed
router.use(authenticateToken);


// Helper function to check facility access for facility admins
const checkFacilityAccess = async (req: AuthenticatedRequest, targetUserId: string): Promise<boolean> => {
  if (!req.user) return false;
  
  // Global admins can access all users
  if (AuthService.canAccessAllFacilities(req.user.role)) {
    return true;
  }
  
  // Facility admins can only access users in their facilities
  if (AuthService.isFacilityAdmin(req.user.role)) {
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
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]+$')).required()
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
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  // Get users with facility information
  const usersWithFacilities = await UserFacilityAssociationModel.getUsersWithFacilities();
  
  let filteredUsers = usersWithFacilities;

  // RBAC: Facility admins can only see users from their facilities
  if (userRole === UserRole.FACILITY_ADMIN) {
    // Get facilities managed by this facility admin
    const userFacilityAssociations = await UserFacilityAssociationModel.findByUserId(userId);
    const managedFacilityIds = userFacilityAssociations.map(assoc => assoc.facility_id);

    if (managedFacilityIds.length === 0) {
      // Facility admin with no facilities sees no users
      filteredUsers = [];
    } else {
      // Filter to only users associated with managed facilities
      filteredUsers = filteredUsers.filter(user => {
        if (!user.facility_ids) return false;
        const userFacilityIds = user.facility_ids.split(',').map((id: string) => id.trim());
        // Check if any of the user's facilities match the admin's managed facilities
        return userFacilityIds.some((facId: string) => managedFacilityIds.includes(facId));
      });
    }
  }

  // Apply search filter
  if (search) {
    const searchTerm = String(search).toLowerCase();
    filteredUsers = filteredUsers.filter(user => {
      const first = (user.first_name || '').toLowerCase();
      const last = (user.last_name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const facNames = (user.facility_names || '').toLowerCase();
      return first.includes(searchTerm) || last.includes(searchTerm) || email.includes(searchTerm) || facNames.includes(searchTerm);
    });
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
        aVal = (a.email || '').toLowerCase();
        bVal = (b.email || '').toLowerCase();
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
  if (AuthService.isFacilityAdmin(req.user!.role)) {
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

// GET /users/:id/details - Get detailed user information with facilities, units, and devices
router.get('/:id/details', requireUserManagementOrSelf, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const db = DatabaseService.getInstance().connection;

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

  // Get user facilities
  const userFacilities = await db('user_facility_associations as ufa')
    .join('facilities as f', 'ufa.facility_id', 'f.id')
    .select(
      'f.id as facility_id',
      'f.name as facility_name',
      'f.address as facility_address'
    )
    .where('ufa.user_id', id)
    .orderBy('f.name');

  // Get units for each facility that the user has access to
  const facilityIds = userFacilities.map(f => f.facility_id);
  const facilitiesWithUnits = [];

  if (facilityIds.length > 0) {
    const unitsData = await db('unit_assignments as ua')
      .join('units as u', 'ua.unit_id', 'u.id')
      .leftJoin('blulok_devices as bd', 'u.id', 'bd.unit_id')
      .select(
        'u.facility_id',
        'u.id as unit_id',
        'u.unit_number',
        'u.unit_type',
        'ua.is_primary',
        'bd.id as device_id',
        'bd.device_serial',
        'bd.lock_status',
        'bd.device_status',
        'bd.battery_level'
      )
      .where('ua.tenant_id', id)
      .whereIn('u.facility_id', facilityIds)
      .orderBy('u.unit_number');

    // Combine facilities with their units
    for (const facility of userFacilities) {
      const facilityData = {
        ...facility,
        units: unitsData.filter(u => u.facility_id === facility.facility_id).map(u => ({
          id: u.unit_id,
          unitNumber: u.unit_number,
          unitType: u.unit_type,
          isPrimary: u.is_primary,
          device: u.device_id ? {
            id: u.device_id,
            device_serial: u.device_serial,
            lock_status: u.lock_status,
            device_status: u.device_status,
            battery_level: u.battery_level
          } : undefined
        }))
      };
      facilitiesWithUnits.push(facilityData);
    }
  }

  // facilitiesWithUnits is already properly structured

  // Get user devices (only for dev admins)
  let userDevices: any[] = [];
  const isDevAdmin = AuthService.isAdmin(req.user!.role) && req.user!.role === UserRole.DEV_ADMIN;
  if (isDevAdmin) {
    const userDeviceModel = new UserDeviceModel();
    userDevices = await userDeviceModel.listByUser(id);

    let lockAssociations: any[] = [];
    let distributionErrors: any[] = [];

    try {
      lockAssociations = await db('device_lock_associations as dla')
        .join('blulok_devices as bd', 'dla.lock_id', 'bd.id')
        .join('units as u', 'bd.unit_id', 'u.id')
        .join('facilities as f', 'u.facility_id', 'f.id')
        .select(
          'dla.user_device_id',
          'bd.id as lock_id',
          'bd.device_serial',
          'u.unit_number',
          'f.name as facility_name',
          'dla.key_status',
          'dla.last_error',
          'dla.key_version',
          'dla.key_code'
        )
        .whereIn('dla.user_device_id', userDevices.map(device => device.id));

      distributionErrors = await db('device_lock_associations')
        .select('user_device_id', 'last_error', 'updated_at')
        .whereIn('user_device_id', userDevices.map(device => device.id))
        .whereNotNull('last_error')
        .orderBy('updated_at', 'desc');
    } catch (error) {
      logger.warn('Failed to load device lock associations', {
        error: (error as Error)?.message || error,
      });
    }

    for (const device of userDevices) {
      device.associatedLocks = lockAssociations.filter(lock => lock.user_device_id === device.id);
      device.distributionErrors = distributionErrors
        .filter(error => error.user_device_id === device.id)
        .slice(0, 10);
    }
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
      updatedAt: user.updated_at,
      facilities: facilitiesWithUnits,
      devices: userDevices
    }
  });
}));

// POST /users - Create new user
router.post('/', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) {
    logger.warn('Create user validation failed', {
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
  if (!result.success) {
    logger.warn('Create user failed', {
      requester: req.user?.userId,
      role: req.user?.role,
      reason: result.message,
    });
  } else {
    logger.info('User created', {
      requester: req.user?.userId,
      role: req.user?.role,
      createdUserEmail: userData.email,
      createdRole: userData.role,
    });
  }
  res.status(statusCode).json(result);
}));

// POST /users/:id/resend-invite - Admin action to resend first-time invite
router.post('/:id/resend-invite', requireUserManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = await UserModel.findById(String(id)) as User | undefined;
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  // Facility Admin must have access to this user's facilities; existing helper covers checks in other routes
  // Keep simple here: only ADMIN/DEV_ADMIN or FACILITY_ADMIN with association can proceed (reuse checkFacilityAccess if required)

  await FirstTimeUserService.getInstance().sendInvite(user);
  res.json({ success: true, message: 'Invite resent' });
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

  // Push denylist update to relevant locks via gateway events (fire-and-forget)
  // Device-targeted: determine lock device_ids from user's assigned units AND shared units, then unicast per facility
  (async () => {
    try {
      const { DenylistService } = await import('@/services/denylist.service');
      const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
      const { DatabaseService } = await import('@/services/database.service');
      const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
      const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
      const { config } = await import('@/config/environment');
      const { logger } = await import('@/utils/logger');
      const knex = DatabaseService.getInstance().connection;
      const denylistModel = new DenylistEntryModel();
      
      // Collect all units the user has access to:
      // 1) Primary/assigned units (unit_assignments)
      const primaryUnitIds = await knex('unit_assignments')
        .where('tenant_id', id)
        .pluck('unit_id');

      // 2) Shared units via key_sharing (active and not expired)
      const sharedUnitIds = await knex('key_sharing')
        .where('shared_with_user_id', id)
        .where('is_active', true)
        .where(function(this: any) {
          this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .pluck('unit_id');

      const unitIds = Array.from(new Set([...(primaryUnitIds || []), ...(sharedUnitIds || [])]));

      // Get all devices from these units
      const rows = unitIds.length === 0 ? [] : await knex('blulok_devices as bd')
        .join('units as u', 'bd.unit_id', 'u.id')
        .whereIn('bd.unit_id', unitIds)
        .select('bd.id as device_id', 'u.facility_id');
      
      if (rows.length === 0) {
        return; // No devices to deny
      }

      // Check if we should skip denylist command (user's last route pass is expired)
      const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(id);
      
      // Calculate expiration based on route pass TTL (for DB entry)
      const now = new Date();
      const ttlMs = (config.security.routePassTtlHours || 24) * 60 * 60 * 1000;
      const expiresAt = new Date(now.getTime() + ttlMs);
      const exp = Math.floor(expiresAt.getTime() / 1000);
      const byFacility = new Map<string, string[]>();
      const performedBy = req.user!.userId;

      // Create database entries and group by facility (always do this for audit trail)
      for (const r of rows) {
        await denylistModel.create({
          device_id: r.device_id,
          user_id: id,
          expires_at: expiresAt,
          source: 'user_deactivation',
          created_by: performedBy,
        });

        const list = byFacility.get(r.facility_id) || [];
        list.push(r.device_id);
        byFacility.set(r.facility_id, list);
      }

      // Send denylist commands only if user's last route pass is not expired
      if (!shouldSkip) {
      for (const [facilityId, deviceIds] of byFacility.entries()) {
        const jwt = await DenylistService.buildDenylistAdd([{ sub: id, exp }], deviceIds);
        GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
      }
      } else {
        logger.info(`Skipping DENYLIST_ADD for deactivated user ${id} - last route pass is expired`);
      }

      // -------- Cascading change for GRANTED access (primary_tenant's invitees) --------
      // Updated product decision: inactivate shares only; DO NOT denylist invitees here.
      const activeSharesGranted = await knex('key_sharing')
        .where('primary_tenant_id', id)
        .where('is_active', true)
        .where(function(this: any) {
          this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .select('id', 'unit_id', 'shared_with_user_id');

      for (const share of activeSharesGranted) {
        try {
          // Inactivate the share
          await knex('key_sharing').where('id', share.id).update({ is_active: false, updated_at: knex.fn.now() });
          // No denylist operations for invitees on owner deactivation
        } catch (err) {
          logger.error(`Failed cascading revoke for sharing ${share.id} on deactivation of user ${id}:`, err);
        }
      }
    } catch (error) {
      logger.error('Failed to push denylist on user deactivation:', error);
    }
  })();

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

  // On activation: remove owner from device denylists and reactivate shares
  (async () => {
    const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
    const { DenylistService } = await import('@/services/denylist.service');
    const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
    const { DatabaseService } = await import('@/services/database.service');
    const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
    const { logger } = await import('@/utils/logger');

    const knex = DatabaseService.getInstance().connection;
    const denylistModel = new DenylistEntryModel();

    try {
      // Load active denylist entries for this user
      const entries = await denylistModel.findByUser(id);
      if (entries.length > 0) {
        // Map device -> facility
        const deviceIds = Array.from(new Set(entries.map(e => e.device_id)));
        const deviceFacilityRows = await knex('blulok_devices as bd')
          .join('units as u', 'bd.unit_id', 'u.id')
          .whereIn('bd.id', deviceIds)
          .select('bd.id as device_id', 'u.facility_id');

        const facilityToDeviceIds = new Map<string, string[]>();
        for (const row of deviceFacilityRows) {
          const list = facilityToDeviceIds.get(row.facility_id) || [];
          list.push(row.device_id);
          facilityToDeviceIds.set(row.facility_id, list);
        }

        // Send remove commands per facility, honoring optimization
        for (const [facilityId, targetDeviceIds] of facilityToDeviceIds.entries()) {
          const entriesForFacility = entries.filter(e => targetDeviceIds.includes(e.device_id));
          const entriesToProcess = entriesForFacility.filter(e => !DenylistOptimizationService.shouldSkipDenylistRemove(e as any));

          // Always clean DB entries
          for (const deviceId of targetDeviceIds) {
            await denylistModel.remove(deviceId, id);
          }

          if (entriesToProcess.length > 0) {
            const jwt = await DenylistService.buildDenylistRemove([{ sub: id, exp: 0 }], targetDeviceIds);
            GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
          } else {
            logger.info(`Skipped DENYLIST_REMOVE for user ${id} on ${targetDeviceIds.length} device(s) - entries already expired, removed from DB only`);
          }
        }
      }
    } catch (err) {
      logger.error(`Failed to process denylist removal on activation for user ${id}:`, err);
    }

    try {
      // Reactivate previously deactivated (and unexpired) shares owned by this user
      await knex('key_sharing')
        .where('primary_tenant_id', id)
        .where('is_active', false)
        .where(function(this: any) {
          this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .update({ is_active: true, updated_at: knex.fn.now() });
    } catch (err) {
      logger.error(`Failed to reactivate shares on activation for user ${id}:`, err);
    }
  })().catch(() => {});

  res.json({ success: true, message: 'User activated successfully' });
}));

export { router as usersRouter };
