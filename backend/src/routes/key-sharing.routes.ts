import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { KeySharingModel } from '../models/key-sharing.model';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';

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
    switch (user.role) {
      case UserRole.ADMIN:
      case UserRole.DEV_ADMIN:
        // Admins can see everything - no additional filtering
        break;
        
      case UserRole.FACILITY_ADMIN:
        // Facility admins can only see sharing for their assigned facilities
        if (user.facilityIds && user.facilityIds.length > 0) {
          filters.facility_ids = user.facilityIds;
        }
        break;
        
      case UserRole.TENANT:
        // Tenants can only see sharing for their own units or units they have shared access to
        filters.primary_tenant_id = user.userId;
        break;
        
      case UserRole.MAINTENANCE:
        // Maintenance can only see their own sharing
        filters.shared_with_user_id = user.userId;
        break;
        
      default:
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
    if (![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(user.role)) {
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
    
    if (!hasAccess && ![UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(user.role)) {
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
    } = req.body;

    // Validate required fields
    if (!unit_id || !shared_with_user_id) {
      res.status(400).json({ error: 'unit_id and shared_with_user_id are required' });
      return;
    }
    
    // Validate access_level
    const validAccessLevels = ['full', 'limited', 'temporary', 'permanent'];
    if (access_level && !validAccessLevels.includes(access_level)) {
      res.status(400).json({ error: 'Invalid access_level. Must be one of: full, limited, temporary, permanent' });
      return;
    }
    
    // Validate expires_at format if provided
    if (expires_at) {
      const expiresDate = new Date(expires_at);
      if (isNaN(expiresDate.getTime())) {
        res.status(400).json({ error: 'Invalid expires_at format. Must be a valid ISO date string' });
        return;
      }
    }

    // Check permissions
    if (user.role === UserRole.TENANT) {
      // Tenants can only share keys for units they own
      const hasAccess = await keySharingModel.checkUserHasAccess(user.userId, unit_id);
      if (!hasAccess) {
        res.status(403).json({ error: 'You can only share keys for units you own' });
        return;
      }
    } else if (![UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions to share keys' });
      return;
    }

    // Check if sharing already exists
    const existingSharings = await keySharingModel.getUnitSharedKeys(unit_id, {
      shared_with_user_id,
      is_active: true
    });

    if (existingSharings.sharings.length > 0) {
      res.status(409).json({ error: 'Key sharing already exists for this user and unit' });
      return;
    }

    const sharingData = {
      unit_id,
      primary_tenant_id: user.userId, // For now, assume the current user is the primary tenant
      shared_with_user_id,
      access_level,
      expires_at: expires_at ? new Date(expires_at) : null,
      granted_by: user.userId,
      notes,
      access_restrictions
    };

    const sharing = await keySharingModel.create(sharingData);
    
    res.status(201).json({ success: true, ...sharing });
  } catch (error) {
    console.error('Error creating key sharing record:', error);
    res.status(500).json({ error: 'Failed to create key sharing record' });
  }
});

// Update a key sharing record
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const {
      access_level,
      expires_at,
      notes,
      access_restrictions,
      is_active
    } = req.body;

    // Get the existing sharing record
    if (!id) {
      res.status(400).json({ error: 'Sharing ID is required' });
      return;
    }
    const existingSharing = await keySharingModel.findById(id);
    if (!existingSharing) {
      res.status(404).json({ error: 'Key sharing record not found' });
      return;
    }

    // Check permissions
    if (user.role === UserRole.TENANT) {
      // Tenants can only modify sharing for units they own
      if (existingSharing.primary_tenant_id !== user.userId) {
        res.status(403).json({ error: 'You can only modify sharing for units you own' });
        return;
      }
    } else if (![UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions to modify key sharing' });
      return;
    }

    const updateData: any = {};
    if (access_level !== undefined) updateData.access_level = access_level;
    if (expires_at !== undefined) updateData.expires_at = expires_at ? new Date(expires_at) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (access_restrictions !== undefined) updateData.access_restrictions = access_restrictions;
    if (is_active !== undefined) updateData.is_active = is_active;

    const updatedSharing = await keySharingModel.update(id, updateData);
    
    res.json({ success: true, ...updatedSharing });
  } catch (error) {
    console.error('Error updating key sharing record:', error);
    res.status(500).json({ error: 'Failed to update key sharing record' });
  }
});

// Revoke key sharing
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    // Get the existing sharing record
    if (!id) {
      res.status(400).json({ error: 'Sharing ID is required' });
      return;
    }
    const existingSharing = await keySharingModel.findById(id);
    if (!existingSharing) {
      res.status(404).json({ error: 'Key sharing record not found' });
      return;
    }

    // Check permissions
    if (user.role === UserRole.TENANT) {
      // Tenants can only revoke sharing for units they own
      if (existingSharing.primary_tenant_id !== user.userId) {
        res.status(403).json({ error: 'You can only revoke sharing for units you own' });
        return;
      }
    } else if (![UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions to revoke key sharing' });
      return;
    }

    const success = await keySharingModel.revokeSharing(id);
    
    if (success) {
      res.json({ message: 'Key sharing revoked successfully' });
    } else {
      res.status(500).json({ error: 'Failed to revoke key sharing' });
    }
  } catch (error) {
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
