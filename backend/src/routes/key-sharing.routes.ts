/**
 * Key Sharing Routes
 *
 * Comprehensive key sharing management API for controlling temporary and permanent
 * access sharing between tenants and authorized users. Enables flexible access
 * control while maintaining security and audit trails.
 *
 * Key Features:
 * - Multi-level access sharing (full, limited, temporary)
 * - Expiration-based access revocation
 * - Comprehensive audit trail for sharing operations
 * - Role-based access control for sharing management
 * - Integration with user notifications and access control
 *
 * Access Levels:
 * - full: Complete access equivalent to primary tenant
 * - limited: Restricted access with specific limitations
 * - temporary: Time-bound access with automatic expiration
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full access to all sharing records
 * - FACILITY_ADMIN: Management of sharing in assigned facilities
 * - TENANT: Management of sharing for their own units
 *
 * Sharing Operations:
 * - Create sharing invitations with access levels and expiration
 * - Accept/reject sharing invitations
 * - Update sharing permissions and expiration dates
 * - Revoke sharing access immediately
 * - Monitor active sharing relationships
 * - Search and filter sharing records
 *
 * Security Considerations:
 * - User isolation prevents unauthorized sharing management
 * - Permission validation before sharing operations
 * - Expiration enforcement prevents indefinite access
 * - Audit logging for all sharing lifecycle events
 * - Secure sharing invitation and acceptance workflows
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { KeySharingModel } from '../models/key-sharing.model';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';
import { AuthService } from '../services/auth.service';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import { toE164 } from '@/utils/phone.util';
import { parseQueryBoolean } from '@/utils/query-boolean.util';
import { AccessLogModel } from '../models/access-log.model';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  keySharingListQuerySchema,
  keySharingUserQuerySchema,
  keySharingUnitQuerySchema,
  keySharingUserIdParamSchema,
  keySharingUnitIdParamSchema,
  keySharingIdParamSchema,
  createKeySharingSchema,
  updateKeySharingSchema,
  keySharingInviteSchema,
  keySharingResponseSchema,
} from '@/schemas/key-sharing.schemas';

const router = Router();
const MOUNT = '/api/v1/key-sharing';
const keySharingModel = new KeySharingModel();
const accessLogModel = new AccessLogModel();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get key sharing records
registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['KeySharing'],
    summary: 'List key sharing records',
    security: 'bearer',
    query: keySharingListQuerySchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      unit_id,
      primary_tenant_id,
      shared_with_user_id,
      access_level,
      is_active,
      expires_before,
      limit = 50,
      offset = 0,
      sort_by = 'shared_at',
      sort_order = 'desc'
    } = req.query;

    const filters: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sort_by: sort_by as string,
      sort_order: sort_order as string
    };

    // Add query filters if provided
    if (unit_id) filters.unit_id = unit_id as string;
    if (primary_tenant_id) filters.primary_tenant_id = primary_tenant_id as string;
    if (shared_with_user_id) filters.shared_with_user_id = shared_with_user_id as string;
    if (access_level) filters.access_level = access_level as string;
    // By default only return active sharings; allow explicit override via query
    if (is_active === undefined) {
      filters.is_active = true;
    } else {
      filters.is_active = parseQueryBoolean(is_active) ?? false;
    }
    if (expires_before) filters.expires_before = new Date(expires_before as string);

    // Apply role-based filtering
    if (AuthService.isAdmin(user.role)) {
      // Admins can see everything - no additional filtering
    } else if (AuthService.isFacilityAdmin(user.role)) {
      // Facility admins can only see sharing for their assigned facilities
      if (user.facilityIds && user.facilityIds.length > 0) {
        filters.facility_ids = user.facilityIds;
      }
    } else if (user.role === UserRole.TENANT) {
      // Tenants can only see sharing for their own units or units they have shared access to
      filters.primary_tenant_id = user.userId;
    } else if (user.role === UserRole.MAINTENANCE) {
      // Maintenance can only see their own sharing
      filters.shared_with_user_id = user.userId;
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const result = await keySharingModel.findAll(filters);

    // Default flat response
    const response: any = {
      success: true,
      sharings: result.sharings,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset
    };

    // Optional grouped-by-unit view when explicitly requested.
    // This preserves backwards compatibility for existing clients.
    const groupByUnit = parseQueryBoolean(req.query.group_by_unit);
    if (groupByUnit === true) {
      const unitsMap = new Map<string, any>();

      for (const sharing of result.sharings) {
        const unitId = sharing.unit_id;
        if (!unitsMap.has(unitId)) {
          unitsMap.set(unitId, {
            unit_id: unitId,
            unit_number: sharing.unit_number,
            facility_name: sharing.facility_name,
            primary_tenant_id: sharing.primary_tenant_id,
            primary_tenant_name: sharing.primary_tenant_name,
            primary_tenant_email: sharing.primary_tenant_email,
            sharings: [] as any[]
          });
        }

        const unitEntry = unitsMap.get(unitId);
        unitEntry.sharings.push({
          id: sharing.id,
          shared_with_user_id: sharing.shared_with_user_id,
          shared_with_name: sharing.shared_with_name,
          shared_with_email: sharing.shared_with_email,
          access_level: sharing.access_level,
          shared_at: sharing.shared_at,
          expires_at: sharing.expires_at,
          granted_by: sharing.granted_by,
          granted_by_name: sharing.granted_by_name,
          notes: sharing.notes,
          is_active: sharing.is_active,
          access_restrictions: sharing.access_restrictions
        });
      }

      const units = Array.from(unitsMap.values());
      response.units = units;
      response.total_units = units.length;
      response.total_sharings = result.total;
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching key sharing records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch key sharing records' });
  }
});

registerGet(
  router,
  '/user/:userId',
  {
    openApiPath: `${MOUNT}/user/{userId}`,
    tags: ['KeySharing'],
    summary: 'Get key sharing records for a user',
    security: 'bearer',
    params: keySharingUserIdParamSchema,
    query: keySharingUserQuerySchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { userId } = req.params;
    
    // Check permissions
    if (user.role === UserRole.TENANT && user.userId !== userId) {
      res.status(403).json({ error: 'Can only view your own sharing records' });
      return;
    }
    
    if (user.role === UserRole.MAINTENANCE && user.userId !== userId) {
      res.status(403).json({ error: 'Can only view your own sharing records' });
      return;
    }
    
    const {
      unit_id,
      access_level,
      is_active,
      expires_before,
      limit = 50,
      offset = 0,
      sort_by = 'shared_at',
      sort_order = 'desc'
    } = req.query;

    const filters: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sort_by: sort_by as string,
      sort_order: sort_order as string
    };

    // Add query filters
    if (unit_id) filters.unit_id = unit_id as string;
    if (access_level) filters.access_level = access_level as string;
    if (is_active !== undefined) {
      const parsed = parseQueryBoolean(is_active);
      if (parsed !== undefined) filters.is_active = parsed;
    }
    if (expires_before) filters.expires_before = new Date(expires_before as string);

    // Get both owned keys and shared keys
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    
    // For facility admins, scope the query to their assigned facilities
    if (AuthService.isFacilityAdmin(user.role) && user.facilityIds && user.facilityIds.length > 0) {
      filters.facility_ids = user.facilityIds;
    }

    // Check if target user exists (admins and facility admins can inspect others)
    if (AuthService.isAdmin(user.role) || AuthService.isFacilityAdmin(user.role)) {
      // For admin users, we should check if the user exists
      const { UserModel } = await import('../models/user.model');
      const targetUser = await UserModel.findById(userId);
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    } else {
      // For non-admin/non-facility-admin users, we already validated they can only access their own records
    }
    
    const ownedKeys = await keySharingModel.getUserOwnedKeys(userId, filters);
    const sharedKeys = await keySharingModel.getUserSharedKeys(userId, filters);
    
    res.json({
      success: true,
      owned_keys: ownedKeys.sharings,
      shared_keys: sharedKeys.sharings,
      total_owned: ownedKeys.total,
      total_shared: sharedKeys.total,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    console.error('Error fetching user key sharing records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user key sharing records' });
  }
});

registerGet(
  router,
  '/unit/:unitId',
  {
    openApiPath: `${MOUNT}/unit/{unitId}`,
    tags: ['KeySharing'],
    summary: 'Get key sharing records for a unit',
    security: 'bearer',
    params: keySharingUnitIdParamSchema,
    query: keySharingUnitQuerySchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { unitId } = req.params;
    
    // Check if user has access to this unit
    if (!unitId) {
      res.status(400).json({ error: 'Unit ID is required' });
      return;
    }
    
    // Check if unit exists (simple database check - no access validation needed here)
    const { UnitModel } = await import('../models/unit.model');
    const unitModel = new UnitModel();
    const unit = await unitModel.findById(unitId);
    if (!unit) {
      res.status(404).json({ error: 'Unit not found' });
      return;
    }
    
    // For admins, skip access check - they can view key sharing for any unit
    // For non-admins, verify they have key sharing access to this unit
    if (!AuthService.canManageUsers(user.role)) {
      const hasAccess = await keySharingModel.checkUserHasAccess(user.userId, unitId);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this unit' });
        return;
      }
    }
    
    const {
      access_level,
      is_active,
      expires_before,
      limit = 50,
      offset = 0,
      sort_by = 'shared_at',
      sort_order = 'desc'
    } = req.query;

    const filters: any = {
      unit_id: unitId,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sort_by: sort_by as string,
      sort_order: sort_order as string
    };

    // Add query filters
    if (access_level) filters.access_level = access_level as string;
    // By default only return active sharings; allow explicit override via query
    if (is_active === undefined) {
      filters.is_active = true;
    } else {
      filters.is_active = parseQueryBoolean(is_active) ?? false;
    }
    if (expires_before) filters.expires_before = new Date(expires_before as string);

    const result = await keySharingModel.getUnitSharedKeys(unitId, filters);

    // Convenience: include a small slice of recent activity logs for this unit.
    // We reuse the access history model but keep this response focused on key sharing.
    const recentActivityLimit = 20;
    const activityResult = await accessLogModel.getUnitAccessHistory(unitId, {
      limit: recentActivityLimit,
      sort_by: 'occurred_at',
      sort_order: 'desc'
    } as any);

    // RBAC: Primary tenants (owners) and managers (admin/dev_admin/facility_admin)
    // can see the full sharing roster for the unit. Shared users (tenants with
    // non-primary shared access) should only see their own sharing record(s) and
    // their own activity.
    let sharings = result.sharings;
    let totalSharings = result.total;
    let recentActivity = activityResult.logs;
    let totalActivity = activityResult.total;

    const isManager = AuthService.canManageUsers(user.role);
    if (user.role === UserRole.TENANT && !isManager) {
      const isPrimary = await keySharingModel.isPrimaryTenantForUnit(user.userId, unitId);
      if (!isPrimary) {
        // Shared user: restrict view to their own sharing + activity
        sharings = sharings.filter((s: any) => s.shared_with_user_id === user.userId);
        totalSharings = sharings.length;
        recentActivity = recentActivity.filter((log: any) => log.user_id === user.userId);
        totalActivity = recentActivity.length;
      }
    }

    res.json({
      success: true,
      unit: {
        id: unit.id,
        unit_number: unit.unit_number,
        facility_id: unit.facility_id,
        facility_name: (unit as any).facility_name || undefined,
        primary_tenant_id: (unit as any).primary_tenant_id || undefined
      },
      sharings,
      total: totalSharings,
      limit: filters.limit,
      offset: filters.offset,
      recent_activity: recentActivity,
      total_activity: totalActivity
    });
  } catch (error: any) {
    logger.error('Error fetching unit key sharing records:', error);
    // Preserve 403/404 status codes if they were set
    if (error?.statusCode) {
      res.status(error.statusCode).json({ 
        success: false, 
        message: error.message || 'Failed to fetch unit key sharing records' 
      });
      return;
    }
    // Check if it's an access denied error
    if (error?.message?.includes('Access denied')) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied to this unit' 
      });
      return;
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch unit key sharing records' 
    });
  }
});

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['KeySharing'],
    summary: 'Create a key sharing record',
    security: 'bearer',
    body: createKeySharingSchema,
    responses: {
      201: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const {
        unit_id,
        shared_with_user_id,
        access_level = 'limited',
        expires_at,
        notes,
        access_restrictions,
      } = req.body || {};

    const { KeySharingService } = await import('@/services/key-sharing.service');
    const svc = KeySharingService.getInstance();
    const sharing = await svc.createShare(
      { userId: user.userId, role: user.role },
      {
        unit_id,
        shared_with_user_id,
        access_level,
        expires_at: expires_at ? new Date(expires_at) : null,
        notes,
        access_restrictions,
      }
    );
    res.status(201).json({ success: true, ...sharing });
  } catch (error) {
    const msg = String((error as any)?.message || '');
    if (msg.includes('only share keys for units you own') || msg.includes('Insufficient permissions')) {
      res.status(403).json({ error: msg });
      return;
    }
    if (msg.includes('already exists')) {
      res.status(409).json({ error: msg });
      return;
    }
    console.error('Error creating key sharing record:', error);
    res.status(500).json({ error: 'Failed to create key sharing record' });
  }
});

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['KeySharing'],
    summary: 'Update a key sharing record',
    security: 'bearer',
    params: keySharingIdParamSchema,
    body: updateKeySharingSchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { KeySharingService } = await import('@/services/key-sharing.service');
    const svc = KeySharingService.getInstance();
    const updatedSharing = await svc.updateShare(
      { userId: user.userId, role: user.role },
      id,
      {
        access_level: req.body.access_level,
        expires_at: req.body.expires_at === undefined
          ? undefined
          : (req.body.expires_at ? new Date(req.body.expires_at) : null),
        notes: req.body.notes,
        access_restrictions: req.body.access_restrictions,
        is_active: req.body.is_active,
      }
    );
    res.json({ success: true, ...updatedSharing });
  } catch (error) {
    const msg = String((error as any)?.message || '');
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('only modify sharing for units you own') || msg.includes('Insufficient permissions')) {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('Error updating key sharing record:', error);
    res.status(500).json({ error: 'Failed to update key sharing record' });
  }
});

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['KeySharing'],
    summary: 'Revoke key sharing',
    security: 'bearer',
    params: keySharingIdParamSchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { KeySharingService } = await import('@/services/key-sharing.service');
    const svc = KeySharingService.getInstance();
    const success = await svc.revokeShare({ userId: user.userId, role: user.role }, id, user.userId || 'system');
    if (success) res.json({ message: 'Key sharing revoked successfully' });
    else res.status(500).json({ error: 'Failed to revoke key sharing' });
  } catch (error) {
    const msg = String((error as any)?.message || '');
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('only revoke sharing for units you own') || msg.includes('Insufficient permissions')) {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('Error revoking key sharing:', error);
    res.status(500).json({ error: 'Failed to revoke key sharing' });
  }
});

registerGet(
  router,
  '/admin/expired',
  {
    openApiPath: `${MOUNT}/admin/expired`,
    tags: ['KeySharing'],
    summary: 'List expired key sharing records (admin only)',
    security: 'bearer',
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    // Check permissions
    if (![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const expiredSharings = await keySharingModel.getExpiredSharings();
    
    res.json({
      success: true,
      expired_sharings: expiredSharings,
      total: expiredSharings.length
    });
  } catch (error) {
    console.error('Error fetching expired sharing records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch expired sharing records' });
  }
});

registerPost(
  router,
  '/invite',
  {
    openApiPath: `${MOUNT}/invite`,
    tags: ['KeySharing'],
    summary: 'Invite a user to key sharing by phone',
    security: 'bearer',
    body: keySharingInviteSchema,
    responses: {
      200: keySharingResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { unit_id, phone, access_level = 'limited', expires_at } = req.body || {};

    let expiresAtDate: Date | null = null;
    if (expires_at) {
      expiresAtDate = new Date(expires_at);
    }

    const knex = DatabaseService.getInstance().connection;
    const unit = await knex('units').where('id', unit_id).first();
    if (!unit) {
      res.status(404).json({ success: false, message: 'Unit not found' });
      return;
    }

    if (user.role === UserRole.TENANT) {
      const primaryAssignment = await knex('unit_assignments')
        .where({ unit_id, tenant_id: user.userId, is_primary: true })
        .first();
      if (!primaryAssignment) {
        res.status(403).json({ success: false, message: 'Only primary tenants can share this unit' });
        return;
      }
    } else if (user.role === UserRole.FACILITY_ADMIN) {
      const allowed = user.facilityIds?.includes(unit.facility_id);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Access denied to unit in this facility' });
        return;
      }
    } else if (![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    const phoneE164 = toE164(phone, 'US');

    const { KeySharingService } = await import('@/services/key-sharing.service');
    const svc = KeySharingService.getInstance();
    const { shareId, inviteWarning } = await svc.inviteByPhone({
      unitId: unit_id,
      phoneE164,
      accessLevel: access_level,
      expiresAt: expiresAtDate ?? undefined,
      grantedBy: user.userId,
      primaryTenantIdFallback: user.role === UserRole.TENANT ? user.userId : undefined,
    });

    res.status(200).json({
      success: true,
      share_id: shareId,
      ...(inviteWarning ? { invite_sent: false, invite_warning: inviteWarning } : {}),
    });
  } catch (error: any) {
    logger.error('Error processing key share invite:', error);
    res.status(500).json({ success: false, message: 'Failed to process invite' });
  }
});

export default router;
