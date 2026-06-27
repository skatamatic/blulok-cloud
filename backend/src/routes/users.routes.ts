import { Router, Response, NextFunction } from 'express';
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
import { AppEntryAccessService } from '@/services/passes/app-entry-access.service';
import { AccessCodeService } from '@/services/access-code.service';
import { toE164 } from '@/utils/phone.util';
import { runUserActivationSideEffects } from '@/services/user-activation-side-effects.service';
import { runUserDeactivationSideEffects } from '@/services/user-deactivation-side-effects.service';
import {
  assertRequesterMayAssignRoleOnCreate,
  assertRequesterMayAssignRoleOnUpdate,
  FACILITY_ADMIN_CREATABLE_ROLES,
  filterUsersForListScope,
  userMatchesFacilityFilter,
  validateFacilityIdsForAssignment,
} from '@/utils/users-rbac.util';
import { UserListScopeService } from '@/services/user-list-scope.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  CREATE_PASSWORD_PATTERN,
  usersListQuerySchema,
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  usersResponseSchema,
} from '@/schemas/users.schemas';

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
const MOUNT = '/api/v1/users';

// All routes require authentication - no anonymous access allowed
router.use(authenticateToken);


// Helper function to check facility access for facility admins
const checkFacilityAccess = async (req: AuthenticatedRequest, targetUserId: string): Promise<boolean> => {
  if (!req.user) return false;

  return UserListScopeService.canRequesterViewUser(
    req.user.userId,
    req.user.role,
    targetUserId,
    req.user.facilityIds ?? []
  );
};

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Users'],
    summary: 'List users with filtering',
    security: 'bearer',
    query: usersListQuerySchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { search, role, facility, sortBy, sortOrder, sort_by, sort_order, facility_id, limit, offset } = req.query;
  const resolvedSortBy = (sortBy ?? sort_by ?? 'created_at') as string;
  const resolvedSortOrder = (sortOrder ?? sort_order ?? 'desc') as string;
  const resolvedFacility = (facility ?? facility_id) as string | undefined;
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  // Get users with facility information
  const usersWithFacilities = await UserFacilityAssociationModel.getUsersWithFacilities();

  const managedFacilityIds =
    userRole === UserRole.FACILITY_ADMIN
      ? req.user!.facilityIds ?? []
      : [];

  const sharedAccessUserIds =
    userRole === UserRole.TENANT || userRole === UserRole.MAINTENANCE
      ? await UserListScopeService.getSharedAccessRecipientUserIds(userId)
      : new Set<string>();

  let filteredUsers = filterUsersForListScope(
    usersWithFacilities,
    userRole,
    userId,
    managedFacilityIds,
    sharedAccessUserIds
  );

  // Apply search filter
  if (search) {
    const searchTerm = String(search).toLowerCase();
    filteredUsers = filteredUsers.filter(user => {
      const first = (user.first_name || '').toLowerCase();
      const last = (user.last_name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const phone = String(user.phone_number || '').toLowerCase();
      const facNames = (user.facility_names || '').toLowerCase();
      return first.includes(searchTerm) || last.includes(searchTerm) || email.includes(searchTerm) || phone.includes(searchTerm) || facNames.includes(searchTerm);
    });
  }

  // Apply role filter
  if (role) {
    filteredUsers = filteredUsers.filter(user => user.role === role);
  }

  // Apply facility filter
  if (resolvedFacility) {
    filteredUsers = filteredUsers.filter((user) => userMatchesFacilityFilter(user, String(resolvedFacility)));
  }

  // Apply sorting
  filteredUsers.sort((a, b) => {
    let aVal, bVal;
    
    switch (resolvedSortBy) {
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
    
    if (resolvedSortOrder === 'desc') {
      return aVal < bVal ? 1 : -1;
    } else {
      return aVal > bVal ? 1 : -1;
    }
  });

  // Apply pagination
  const total = filteredUsers.length;
  const limitNum = limit ? parseInt(limit as string) : 20;
  const offsetNum = offset ? parseInt(offset as string) : 0;
  
  const paginatedUsers = filteredUsers.slice(offsetNum, offsetNum + limitNum);

  const sanitizedUsers = paginatedUsers.map(user => ({
    id: user.id,
    email: user.email,
    phoneNumber: user.phone_number ?? null,
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

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Users'],
    summary: 'Get user by ID',
    security: 'bearer',
    params: userIdParamSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagementOrSelf,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      phoneNumber: user.phone_number ?? null,
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

registerGet(
  router,
  '/:id/details',
  {
    openApiPath: `${MOUNT}/{id}/details`,
    tags: ['Users'],
    summary: 'Get detailed user information',
    security: 'bearer',
    params: userIdParamSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagementOrSelf,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  let accessControlDevices: any[] = [];
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

  const targetRole = user.role as UserRole;
  const targetFacilityIds = facilityIds.map((facilityId) => String(facilityId));
  try {
    const appEntryDeviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: id,
      userRole: targetRole,
      facilityIds: targetFacilityIds,
    });

    const appCodes = await AccessCodeService.getInstance().getAppCodesForUser(
      id,
      targetRole,
      targetFacilityIds,
    );
    const codesByDeviceId = new Map<string, Array<{
      code: string;
      valid_from: Date;
      valid_until: Date;
      schedule_id?: string | null;
      schedule_name?: string | null;
    }>>();
    appCodes.forEach((pairing) => {
      const list = codesByDeviceId.get(pairing.device_id) || [];
      list.push({
        code: pairing.code,
        valid_from: pairing.valid_from,
        valid_until: pairing.valid_until,
        schedule_id: pairing.schedule_id ?? null,
        schedule_name: pairing.schedule_name ?? null,
      });
      codesByDeviceId.set(pairing.device_id, list);
    });

    if (appEntryDeviceIds.length > 0) {
      const rows = await db('access_control_devices as d')
        .select(
          'd.id',
          'd.name',
          'd.device_type',
          'd.location_description',
          'd.device_serial',
          'd.relay_channel',
          'd.access_methods',
          'g.facility_id',
        )
        .join('gateways as g', 'g.id', 'd.gateway_id')
        .whereIn('d.id', appEntryDeviceIds)
        .orderBy('d.name', 'asc');

      accessControlDevices = rows.map((row) => {
        const rawMethods = row.access_methods;
        let accessMethods: string[] = [];
        if (Array.isArray(rawMethods)) {
          accessMethods = rawMethods.map((entry) => String(entry));
        } else if (typeof rawMethods === 'string') {
          try {
            const parsed = JSON.parse(rawMethods) as unknown;
            if (Array.isArray(parsed)) {
              accessMethods = parsed.map((entry) => String(entry));
            }
          } catch {
            accessMethods = [];
          }
        }
        return {
          id: String(row.id),
          device_id: String(row.id),
          access_id: String(row.device_serial),
          relay_channel: Number(row.relay_channel),
          facility_id: String(row.facility_id),
          name: String(row.name),
          device_type: row.device_type,
          location_description: row.location_description ?? null,
          access_methods: accessMethods,
          codes: (codesByDeviceId.get(String(row.id)) || []).sort((left, right) => {
            const leftSchedule = String(left.schedule_id ?? '');
            const rightSchedule = String(right.schedule_id ?? '');
            if (leftSchedule !== rightSchedule) return leftSchedule.localeCompare(rightSchedule);
            return String(left.code).localeCompare(String(right.code));
          }),
        };
      });
    }
  } catch (error) {
    logger.warn('Failed to load access-control entitlements for user details', {
      userId: id,
      error: (error as Error)?.message || error,
    });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      phoneNumber: user.phone_number ?? null,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      facilities: facilitiesWithUnits,
      devices: userDevices,
      accessControlDevices: accessControlDevices,
    }
  });
}));

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Users'],
    summary: 'Create a user',
    security: 'bearer',
    body: createUserSchema,
    responses: {
      201: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;
    const passwordTrimmed = typeof value.password === 'string' ? value.password.trim() : '';
  if (passwordTrimmed) {
    if (passwordTrimmed.length < 8 || !CREATE_PASSWORD_PATTERN.test(passwordTrimmed)) {
      res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character (@$!%*?&)',
      });
      return;
    }
  }

  const userData: CreateUserRequest = {
    email: value.email,
    firstName: value.firstName,
    lastName: value.lastName,
    role: value.role,
    ...(passwordTrimmed ? { password: passwordTrimmed } : {}),
    ...(value.phoneNumber && String(value.phoneNumber).trim()
      ? { phoneNumber: String(value.phoneNumber).trim() }
      : {}),
  };

  const roleCheck = assertRequesterMayAssignRoleOnCreate(req, userData.role as UserRole);
  if (!roleCheck.ok) {
    res.status(roleCheck.status).json({ success: false, message: roleCheck.message });
    return;
  }

  const facilityCheck = validateFacilityIdsForAssignment(
    req,
    value.facilityIds || [],
    userData.role as UserRole
  );
  if (!facilityCheck.ok) {
    res.status(facilityCheck.status).json({ success: false, message: facilityCheck.message });
    return;
  }

  const result = await AuthService.createUser(userData);
  if (!result.success) {
    logger.warn('Create user failed', {
      requester: req.user?.userId,
      role: req.user?.role,
      reason: result.message,
    });
    res.status(400).json(result);
    return;
  }

  const newUserId = result.userId as string;

  try {
    if (facilityCheck.facilityIds.length > 0) {
      for (const fid of facilityCheck.facilityIds) {
        await UserFacilityAssociationModel.addUserToFacility(newUserId, fid);
      }
    }
  } catch (assocErr) {
    logger.error('Failed to associate new user with facilities; rolling back user', assocErr);
    try {
      await UserModel.deleteById(newUserId);
    } catch (delErr) {
      logger.error('Failed to delete user after association error', delErr);
    }
    res.status(500).json({
      success: false,
      message: 'User could not be linked to facilities. Try again or verify facility IDs exist.',
    });
    return;
  }

  logger.info('User created', {
    requester: req.user?.userId,
    role: req.user?.role,
    createdUserEmail: userData.email,
    createdRole: userData.role,
  });

  const shouldSendInvite = Boolean(value.sendInvite) && !passwordTrimmed;
  let inviteSent = false;
  let inviteWarning: string | undefined;
  if (shouldSendInvite) {
    try {
      const created = await UserModel.findById(newUserId) as User | undefined;
      if (created) {
        await FirstTimeUserService.getInstance().sendInvite(created);
        inviteSent = true;
      }
    } catch (e) {
      logger.error('Failed to send invite after user create', e);
      inviteWarning =
        'User was created but the invite could not be sent. You can resend from the user profile.';
    }
  }

  res.status(201).json({
    ...result,
    inviteSent,
    ...(inviteWarning ? { inviteWarning } : {}),
  });
}));

registerPost(
  router,
  '/:id/resend-invite',
  {
    openApiPath: `${MOUNT}/{id}/resend-invite`,
    tags: ['Users'],
    summary: 'Resend first-time user invite',
    security: 'bearer',
    params: userIdParamSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = await UserModel.findById(String(id)) as User | undefined;
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const hasAccess = await checkFacilityAccess(req, String(id));
  if (!hasAccess) {
    res.status(403).json({ success: false, message: 'Access denied to this user' });
    return;
  }

  await FirstTimeUserService.getInstance().sendInvite(user);
  res.json({ success: true, message: 'Invite resent' });
}));

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Users'],
    summary: 'Update a user',
    security: 'bearer',
    params: userIdParamSchema,
    body: updateUserSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagementOrSelf,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  const updateData: UpdateUserRequest = req.body;

  // Check if user exists
  const existingUser = await UserModel.findById(id) as User;
  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  // Facility admins may only manage tenant / maintenance / technician accounts (not peers or global roles).
  // Self-service updates (same id) are still allowed for the admin's own profile.
  if (
    AuthService.isFacilityAdmin(req.user!.role) &&
    id !== req.user!.userId &&
    !FACILITY_ADMIN_CREATABLE_ROLES.includes(existingUser.role as UserRole)
  ) {
    res.status(403).json({
      success: false,
      message:
        'Facility admins can only update tenant, maintenance, or BluLok technician users',
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

  const roleAssignCheck = assertRequesterMayAssignRoleOnUpdate(req, updateData.role as UserRole | undefined);
  if (!roleAssignCheck.ok) {
    res.status(roleAssignCheck.status).json({ success: false, message: roleAssignCheck.message });
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

  if (updateData.phoneNumber !== undefined) {
    const raw =
      updateData.phoneNumber === null ? '' : String(updateData.phoneNumber).trim();
    if (raw === '') {
      await UserModel.setPhoneNumber(id, null);
    } else {
      const normalized = toE164(raw, 'US');
      const digits = normalized.replace(/\D/g, '');
      if (!normalized || digits.length < 10) {
        res.status(400).json({
          success: false,
          message: 'Invalid phone number',
        });
        return;
      }
      const other = await UserModel.findByPhone(normalized);
      if (other && other.id !== id) {
        res.status(400).json({
          success: false,
          message: 'Phone number already in use',
        });
        return;
      }
      await UserModel.setPhoneNumber(id, normalized);
    }
  }

  // Update user (non-phone fields)
  const activating =
    updateData.isActive === true && existingUser.is_active === false;
  const deactivating =
    updateData.isActive === false && existingUser.is_active === true;

  if (deactivating) {
    if (id === req.user!.userId) {
      res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account',
      });
      return;
    }
    if (existingUser.role === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({
        success: false,
        message: 'Only dev_admin can deactivate dev_admin users',
      });
      return;
    }
  }

  const updatedUser = await UserModel.updateById(id, {
    first_name: updateData.firstName,
    last_name: updateData.lastName,
    role: updateData.role,
    is_active: updateData.isActive
  }) as User;

  if (activating) {
    void runUserActivationSideEffects(id);
  }
  if (deactivating) {
    void runUserDeactivationSideEffects(id, req.user!.userId);
  }

  res.json({
    success: true,
    message: 'User updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      phoneNumber: updatedUser.phone_number ?? null,
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

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Users'],
    summary: 'Deactivate a user',
    security: 'bearer',
    params: userIdParamSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  void runUserDeactivationSideEffects(id, req.user!.userId);

  res.json({
    success: true,
    message: 'User deactivated successfully'
  });
}));

registerPost(
  router,
  '/:id/activate',
  {
    openApiPath: `${MOUNT}/{id}/activate`,
    tags: ['Users'],
    summary: 'Reactivate a user',
    security: 'bearer',
    params: userIdParamSchema,
    responses: {
      200: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  void runUserActivationSideEffects(id);

  res.json({ success: true, message: 'User activated successfully' });
}));

export { router as usersRouter };
