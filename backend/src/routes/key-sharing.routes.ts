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

const router = Router();
const keySharingModel = new KeySharingModel();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get key sharing records
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    let filters: any = {
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
    if (is_active !== undefined) filters.is_active = is_active === 'true';
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
    
    res.json({
      success: true,
      sharings: result.sharings,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    console.error('Error fetching key sharing records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch key sharing records' });
  }
});

// Get key sharing records for a specific user
router.get('/user/:userId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (expires_before) filters.expires_before = new Date(expires_before as string);

    // Get both owned keys and shared keys
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    
    // Check if user exists (for non-admin users, this is already validated by the permission check above)
    if (!AuthService.isAdmin(user.role)) {
      // For non-admin users, we already validated they can only access their own records
      // So we can proceed without additional user existence check
    } else {
      // For admin users, we should check if the user exists
      const { UserModel } = await import('../models/user.model');
      const targetUser = await UserModel.findById(userId);
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
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

// Get key sharing records for a specific unit
router.get('/unit/:unitId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { unitId } = req.params;
    
    // Check if user has access to this unit
    if (!unitId) {
      res.status(400).json({ error: 'Unit ID is required' });
      return;
    }
    
    // Check if unit exists
    const { UnitModel } = await import('../models/unit.model');
    const unitModel = new UnitModel();
    const unit = await unitModel.findById(unitId);
    if (!unit) {
      res.status(404).json({ error: 'Unit not found' });
      return;
    }
    
    const hasAccess = await keySharingModel.checkUserHasAccess(user.userId, unitId);
    
    if (!hasAccess && !AuthService.canManageUsers(user.role)) {
      res.status(403).json({ error: 'Access denied to this unit' });
      return;
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
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (expires_before) filters.expires_before = new Date(expires_before as string);

    const result = await keySharingModel.getUnitSharedKeys(unitId, filters);
    
    res.json({
      sharings: result.sharings,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    console.error('Error fetching unit key sharing records:', error);
    res.status(500).json({ error: 'Failed to fetch unit key sharing records' });
  }
});

// Create a new key sharing record
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      unit_id,
      shared_with_user_id,
      access_level = 'limited',
      expires_at,
      notes,
      access_restrictions
    } = req.body || {};

    // Basic input validation (keep 400s at route level)
    if (!unit_id || !shared_with_user_id) {
      res.status(400).json({ error: 'unit_id and shared_with_user_id are required' });
      return;
    }
    const validAccessLevels = ['full', 'limited', 'temporary', 'permanent'];
    if (access_level && !validAccessLevels.includes(access_level)) {
      res.status(400).json({ error: 'Invalid access_level. Must be one of: full, limited, temporary, permanent' });
      return;
    }
    if (expires_at) {
      const d = new Date(expires_at);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: 'Invalid expires_at format. Must be a valid ISO date string' });
        return;
      }
    }
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

// Update a key sharing record
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        expires_at: req.body.expires_at ? new Date(req.body.expires_at) : null,
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

// Revoke key sharing
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

// Get expired sharing records (admin only)
router.get('/admin/expired', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

export default router;
// ----- Invite flow: POST /api/v1/key-sharing/invite -----
// Allows a sharer to invite a user by phone number (E.164) and grant shared access to a unit.
// Roles: TENANT (must be primary on unit), FACILITY_ADMIN (scoped to their facilities), ADMIN/DEV_ADMIN (global)
router.post('/invite', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { unit_id, phone, access_level = 'limited', expires_at } = req.body || {};

    // Basic validation
    if (!unit_id) {
      res.status(400).json({ success: false, message: 'unit_id is required' });
      return;
    }
    if (!phone) {
      res.status(400).json({ success: false, message: 'phone is required' });
      return;
    }
    const validAccess = ['full', 'limited', 'temporary'];
    if (access_level && !validAccess.includes(access_level)) {
      res.status(400).json({ success: false, message: 'Invalid access_level' });
      return;
    }
    let expiresAtDate: Date | null = null;
    if (expires_at) {
      const d = new Date(expires_at);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid expires_at format' });
        return;
      }
      expiresAtDate = d;
    }

    // Authorization checks
    // - TENANT: must be primary tenant of the unit
    // - FACILITY_ADMIN: unit must be in one of their facilities
    // - ADMIN/DEV_ADMIN: allowed
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
    const { shareId } = await svc.inviteByPhone({
      unitId: unit_id,
      phoneE164,
      accessLevel: access_level,
      expiresAt: expiresAtDate ?? undefined,
      grantedBy: user.userId,
      primaryTenantIdFallback: user.role === UserRole.TENANT ? user.userId : undefined,
    });

    res.status(200).json({ success: true, share_id: shareId });
  } catch (error: any) {
    logger.error('Error processing key share invite:', error);
    res.status(500).json({ success: false, message: 'Failed to process invite' });
  }
});
