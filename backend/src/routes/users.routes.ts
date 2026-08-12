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
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_MIN_LENGTH,
} from '@/constants/password.constants';

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

  // Apply search filter (supports full "First Last" as well as partial field matches)
  if (search) {
    const searchTerm = String(search).toLowerCase().trim();
    filteredUsers = filteredUsers.filter(user => {
      const first = (user.first_name || '').toLowerCase();
      const last = (user.last_name || '').toLowerCase();
      const fullName = `${first} ${last}`.trim();
      const email = (user.email || '').toLowerCase();
      const phone = String(user.phone_number || '').toLowerCase();
      const facNames = (user.facility_names || '').toLowerCase();
      return (
        fullName.includes(searchTerm)
        || first.includes(searchTerm)
        || last.includes(searchTerm)
        || email.includes(searchTerm)
        || phone.includes(searchTerm)
        || facNames.includes(searchTerm)
      );
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

  const { loadInviteStatusForUsers } = await import('@/utils/user-invite-status.utils');
  const inviteStatusMap = await loadInviteStatusForUsers(paginatedUsers);

  const sanitizedUsers = paginatedUsers.map(user => {
    const invite = inviteStatusMap.get(user.id);
    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phone_number ?? null,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: Boolean(user.is_active),
      simplifiedUi: Boolean(user.simplified_ui),
      isPlaceholder: Boolean(user.is_placeholder),
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      facilityNames: user.facility_names ? user.facility_names.split(',') : [],
      facilityIds: user.facility_ids ? user.facility_ids.split(',') : [],
      inviteStatus: invite?.inviteStatus ?? (user.last_login ? 'active' : 'never_invited'),
      invitedAt: invite?.invitedAt ?? null,
    };
  });

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
      isActive: Boolean(user.is_active),
      simplifiedUi: Boolean(user.simplified_ui),
      isPlaceholder: Boolean(user.is_placeholder),
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

  // Registered mobile app devices (UserDevice rows). Admins see any user; tenants see self.
  let userDevices: any[] = [];
  let accessControlDevices: any[] = [];
  const isSelfRequest = req.user!.userId === id;
  const canLoadUserDevices = AuthService.isAdmin(req.user!.role) || isSelfRequest;
  if (canLoadUserDevices) {
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
  const codesByDeviceId = new Map<string, Array<{
    code: string;
    valid_from: Date;
    valid_until: Date;
    schedule_id?: string | null;
    schedule_name?: string | null;
  }>>();

  try {
    const appEntryDeviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: id,
      userRole: targetRole,
      facilityIds: targetFacilityIds,
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

      try {
        const appCodes = await AccessCodeService.getInstance().getAppCodesForUser(
          id,
          targetRole,
          targetFacilityIds,
        );
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
      } catch (codeError) {
        logger.warn('Failed to load access codes for user details access-control devices', {
          userId: id,
          error: (codeError as Error)?.message || codeError,
        });
      }

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
      isActive: Boolean(user.is_active),
      simplifiedUi: Boolean(user.simplified_ui),
      isPlaceholder: Boolean(user.is_placeholder),
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
    summary: 'Create a user (or reactivate an inactive user when confirmed)',
    security: 'bearer',
    body: createUserSchema,
    responses: {
      201: usersResponseSchema,
      200: usersResponseSchema,
      409: usersResponseSchema,
    },
  },
  requireUserManagement,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;
    const passwordTrimmed = typeof value.password === 'string' ? value.password.trim() : '';
  if (passwordTrimmed) {
    if (passwordTrimmed.length < PASSWORD_MIN_LENGTH || !CREATE_PASSWORD_PATTERN.test(passwordTrimmed)) {
      res.status(400).json({
        success: false,
        message: PASSWORD_COMPLEXITY_MESSAGE,
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

  const result = await AuthService.createUser(userData, {
    reactivateIfInactive: Boolean(value.reactivateIfInactive),
  });

  if (!result.success) {
    if (result.code === 'USER_INACTIVE' && result.inactiveUser) {
      const hasAccess = await checkFacilityAccess(req, result.inactiveUser.id);
      const mayManageExistingRole =
        !AuthService.isFacilityAdmin(req.user!.role) ||
        FACILITY_ADMIN_CREATABLE_ROLES.includes(result.inactiveUser.role as UserRole);

      if (!hasAccess || !mayManageExistingRole) {
        // Avoid leaking inactive accounts outside the requester's scope.
        const genericMessage =
          result.message.includes('phone')
            ? 'Phone number already in use'
            : 'User with this email already exists';
        logger.warn('Create user inactive collision outside requester scope', {
          requester: req.user?.userId,
          inactiveUserId: result.inactiveUser.id,
        });
        res.status(400).json({ success: false, message: genericMessage });
        return;
      }

      logger.info('Create user blocked by inactive account; reactivation available', {
        requester: req.user?.userId,
        inactiveUserId: result.inactiveUser.id,
      });
      res.status(409).json(result);
      return;
    }

    logger.warn('Create user failed', {
      requester: req.user?.userId,
      role: req.user?.role,
      reason: result.message,
      code: result.code,
    });
    res.status(400).json(result);
    return;
  }

  const newUserId = result.userId as string;

  try {
    if (facilityCheck.facilityIds.length > 0) {
      if (result.reactivated) {
        await UserFacilityAssociationModel.setUserFacilities(
          newUserId,
          facilityCheck.facilityIds,
        );
      } else {
        for (const fid of facilityCheck.facilityIds) {
          await UserFacilityAssociationModel.addUserToFacility(newUserId, fid);
        }
      }
    }
  } catch (assocErr) {
    logger.error('Failed to associate user with facilities', assocErr);
    if (!result.reactivated) {
      try {
        await UserModel.deleteById(newUserId);
      } catch (delErr) {
        logger.error('Failed to delete user after association error', delErr);
      }
    }
    res.status(500).json({
      success: false,
      message: 'User could not be linked to facilities. Try again or verify facility IDs exist.',
    });
    return;
  }

  if (result.reactivated) {
    void runUserActivationSideEffects(newUserId);
  }

  logger.info(result.reactivated ? 'User reactivated via create' : 'User created', {
    requester: req.user?.userId,
    role: req.user?.role,
    createdUserEmail: userData.email,
    createdRole: userData.role,
    userId: newUserId,
    reactivated: Boolean(result.reactivated),
  });

  const shouldSendInvite = Boolean(value.sendInvite) && !passwordTrimmed;
  let inviteSent = false;
  let inviteWarning: string | undefined;
  if (shouldSendInvite) {
    try {
      const created = await UserModel.findById(newUserId) as User | undefined;
      if (created) {
        const dispatch = await FirstTimeUserService.getInstance().sendInvite(created);
        inviteSent = dispatch.delivered.length > 0;
        if (dispatch.warning) inviteWarning = dispatch.warning;
        if (!inviteSent) {
          inviteWarning =
            'User was created but no invite was sent — the account has no reachable phone or email.';
        }
      }
    } catch (e) {
      logger.error(
        result.reactivated
          ? 'Failed to send invite after user reactivate'
          : 'Failed to send invite after user create',
        e,
      );
      inviteWarning = result.reactivated
        ? 'User was reactivated but the invite could not be sent. You can resend from the user profile.'
        : 'User was created but the invite could not be sent. You can resend from the user profile.';
    }
  }

  res.status(result.reactivated ? 200 : 201).json({
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

  const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
  if (isPlaceholderUser(user)) {
    res.status(400).json({
      success: false,
      message: 'Cannot invite a placeholder tenant. Add an email or phone first to enable login.',
    });
    return;
  }

  const dispatch = await FirstTimeUserService.getInstance().sendInvite(user);
  if (dispatch.delivered.length === 0) {
    res.status(400).json({
      success: false,
      message: 'No invite was sent — this account has no reachable phone or email.',
    });
    return;
  }
  res.json({
    success: true,
    message: `Invite resent via ${dispatch.delivered.join(', ')}`,
    inviteSent: true,
    ...(dispatch.warning ? { inviteWarning: dispatch.warning } : {}),
  });
}));

registerPost(
  router,
  '/:id/reset-account',
  {
    openApiPath: `${MOUNT}/{id}/reset-account`,
    tags: ['Users'],
    summary: 'Reset account auth identity and re-send invite',
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
      res.status(400).json({ success: false, message: 'User ID is required' });
      return;
    }

    if (id === req.user!.userId) {
      res.status(400).json({ success: false, message: 'Cannot reset your own account' });
      return;
    }

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

    // Same role guards as deactivate
    if (
      AuthService.isFacilityAdmin(req.user!.role) &&
      !FACILITY_ADMIN_CREATABLE_ROLES.includes(user.role as UserRole)
    ) {
      res.status(403).json({
        success: false,
        message:
          'Facility admins can only reset tenant, maintenance, or BluLok technician accounts',
      });
      return;
    }

    if (user.role === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({
        success: false,
        message: 'Only dev_admin can reset a dev_admin account',
      });
      return;
    }

    const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
    if (isPlaceholderUser(user)) {
      res.status(400).json({
        success: false,
        message: 'Cannot reset a placeholder tenant. Add an email or phone first to enable login.',
      });
      return;
    }

    const { AccountResetService } = await import('@/services/account-reset.service');
    try {
      const result = await AccountResetService.getInstance().resetAndReinvite(String(id), {
        performedBy: req.user!.userId,
        sendInvite: true,
      });
      res.json({
        success: true,
        message: result.inviteSent
          ? 'Account reset and invite sent'
          : 'Account reset, but the invite was not delivered',
        devicesRevoked: result.devicesRevoked,
        inviteSent: result.inviteSent,
        ...(result.inviteWarning ? { inviteWarning: result.inviteWarning } : {}),
      });
    } catch (e: any) {
      // Preserve delivery/operational status codes instead of collapsing to 400
      res
        .status(typeof e?.statusCode === 'number' ? e.statusCode : 400)
        .json({ success: false, message: e?.message || 'Account reset failed' });
    }
  }),
);

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
    // Users can only update their own firstName and lastName, not role, isActive, simplifiedUi, or login identity
    if (
      updateData.role !== undefined ||
      updateData.isActive !== undefined ||
      updateData.simplifiedUi !== undefined ||
      updateData.email !== undefined ||
      updateData.phoneNumber !== undefined
    ) {
      res.status(400).json({
        success: false,
        message: 'You cannot modify your own role, active status, simplified UI preference, or login identity'
      });
      return;
    }
  }

  // simplifiedUi is presentation-only and may only be set by global admins
  if (updateData.simplifiedUi !== undefined && !AuthService.isAdmin(req.user!.role)) {
    res.status(403).json({
      success: false,
      message: 'Only admin or dev_admin can set simplified UI preference',
    });
    return;
  }

  const effectiveRole = (updateData.role ?? existingUser.role) as UserRole;
  if (updateData.simplifiedUi === true && effectiveRole !== UserRole.FACILITY_ADMIN) {
    res.status(400).json({
      success: false,
      message: 'Simplified UI preference applies only to facility admins',
    });
    return;
  }

  const { isPlaceholderUser } = await import(
    '@/services/fms/fms-placeholder-user.utils'
  );
  const { preparePlaceholderUpgrade, queueInviteAfterPlaceholderUpgrade } = await import(
    '@/services/fms/fms-placeholder-upgrade'
  );
  const wasPlaceholder = isPlaceholderUser(existingUser);

  let nextEmail =
    existingUser.email != null ? String(existingUser.email).toLowerCase() : null;
  let nextPhone = existingUser.phone_number ?? null;

  if (updateData.email !== undefined) {
    if (!wasPlaceholder && existingUser.email) {
      res.status(400).json({
        success: false,
        message: 'Email can only be set when upgrading a placeholder tenant',
      });
      return;
    }
    const rawEmail =
      updateData.email === null ? '' : String(updateData.email).trim().toLowerCase();
    if (rawEmail === '') {
      nextEmail = null;
    } else {
      nextEmail = rawEmail;
    }
  }

  if (updateData.phoneNumber !== undefined) {
    const raw =
      updateData.phoneNumber === null ? '' : String(updateData.phoneNumber).trim();
    if (raw === '') {
      nextPhone = null;
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
      nextPhone = normalized;
    }
  }

  // Placeholder upgrades require at least one contact when email/phone is being changed
  if (
    wasPlaceholder
    && (updateData.email !== undefined || updateData.phoneNumber !== undefined)
    && !nextEmail
    && !nextPhone
  ) {
    res.status(400).json({
      success: false,
      message: 'Add an email or phone number to enable login for this placeholder tenant',
    });
    return;
  }

  // Non-placeholder phone updates: write immediately (nullable clear supported).
  // Placeholder phone is applied atomically with the upgrade payload below.
  if (updateData.phoneNumber !== undefined && !wasPlaceholder) {
    if (nextPhone) {
      const other = await UserModel.findByPhone(nextPhone);
      if (other && other.id !== id) {
        res.status(400).json({
          success: false,
          message: 'Phone number already in use',
        });
        return;
      }
    }
    await UserModel.setPhoneNumber(id, nextPhone);
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

  let simplifiedUiUpdate: boolean | undefined;
  if (effectiveRole !== UserRole.FACILITY_ADMIN) {
    // Flag only applies to facility admins; clear when role leaves that set
    if (Boolean(existingUser.simplified_ui)) {
      simplifiedUiUpdate = false;
    }
  } else if (updateData.simplifiedUi !== undefined) {
    simplifiedUiUpdate = updateData.simplifiedUi;
  }

  const identityUpdates: Record<string, unknown> = {};
  if (wasPlaceholder && (nextEmail || nextPhone)) {
    const prepared = await preparePlaceholderUpgrade(id, {
      email: nextEmail,
      phoneE164: nextPhone,
    });
    if (!prepared.ok) {
      res.status(400).json({
        success: false,
        message: prepared.message,
      });
      return;
    }
    Object.assign(identityUpdates, prepared.updates);
  }

  const updatedUser = await UserModel.updateById(id, {
    first_name: updateData.firstName,
    last_name: updateData.lastName,
    role: updateData.role,
    is_active: updateData.isActive,
    simplified_ui: simplifiedUiUpdate,
    ...identityUpdates,
  }) as User;

  if (activating) {
    void runUserActivationSideEffects(id);
  }
  if (deactivating) {
    void runUserDeactivationSideEffects(id, req.user!.userId);
  }

  if (wasPlaceholder && updatedUser && !isPlaceholderUser(updatedUser)) {
    queueInviteAfterPlaceholderUpgrade(updatedUser);
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
      isActive: Boolean(updatedUser.is_active),
      simplifiedUi: Boolean(updatedUser.simplified_ui),
      isPlaceholder: Boolean(updatedUser.is_placeholder),
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

  // Facility admins may only deactivate tenant / maintenance / technician accounts.
  if (
    AuthService.isFacilityAdmin(req.user!.role) &&
    !FACILITY_ADMIN_CREATABLE_ROLES.includes(existingUser.role as UserRole)
  ) {
    res.status(403).json({
      success: false,
      message:
        'Facility admins can only deactivate tenant, maintenance, or BluLok technician users',
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

  // Facility admins may only activate tenant / maintenance / technician accounts.
  if (
    AuthService.isFacilityAdmin(req.user!.role) &&
    !FACILITY_ADMIN_CREATABLE_ROLES.includes(existingUser.role as UserRole)
  ) {
    res.status(403).json({
      success: false,
      message:
        'Facility admins can only activate tenant, maintenance, or BluLok technician users',
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
