import { Router, Response } from 'express';
import { UnitsService } from '@/services/units.service';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { WebSocketService } from '@/services/websocket.service';
import { createUnitSchema, updateUnitSchema } from '@/schemas/unit.schemas';

const router = Router();

// All routes require authentication
router.use(authenticateToken as any);

// GET /units - Get units for the authenticated user (supports both widget and management page)
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const filters = req.query;

  try {
    const unitsService = UnitsService.getInstance();
    const result = await unitsService.getUnits(userId, userRole, filters);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch units'
    });
  }
}));

// GET /units/unlocked - Get unlocked units for the authenticated user
router.get('/unlocked', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  try {
    const unitsService = UnitsService.getInstance();
    const result = await unitsService.getUnits(userId, userRole, { lock_status: 'unlocked' });

    res.json({
      success: true,
      units: result.units || [],
      total: result.total || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unlocked units'
    });
  }
}));

// GET /units/my - Get my units (tenant only)
router.get('/my', requireRoles([UserRole.TENANT]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  try {
    const unitsService = UnitsService.getInstance();
    const result = await unitsService.getUnits(userId, userRole, {});

    res.json({
      success: true,
      units: result.units || [],
      total: result.total || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch my units'
    });
  }
}));

// GET /units/:unitId - Get unit details by ID
router.get('/:unitId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const unitId = req.params.unitId;

  if (!userRole) {
    res.status(401).json({
      success: false,
      message: 'User role not found'
    });
    return;
  }

  if (!unitId) {
    res.status(400).json({
      success: false,
      message: 'Unit ID is required'
    });
    return;
  }

  try {
    const unitsService = UnitsService.getInstance();
    const unit = await unitsService.getUnitDetails(unitId, userId, userRole as UserRole);

    if (!unit) {
      res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
      return;
    }

    res.json({
      success: true,
      unit
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Access denied') {
      res.status(403).json({
        success: false,
        message: 'Access denied to this unit'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unit details'
    });
  }
}));

// POST /units/:unitId/lock - Lock a specific unit
router.post('/:unitId/lock', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { unitId } = req.params;
  const userId = req.user!.userId;

  if (!unitId) {
    res.status(400).json({
      success: false,
      message: 'Unit ID is required'
    });
    return;
  }

  try {
    const unitsService = UnitsService.getInstance();
    const success = await unitsService.lockUnit(unitId, userId);

    if (success) {
      // Broadcast the units update to all subscribers
      const wsService = WebSocketService.getInstance();
      await wsService.broadcastUnitsUpdate();
      
      // Also broadcast battery status update since unit updates may affect battery levels
      await wsService.broadcastBatteryStatusUpdate();

      res.json({
        success: true,
        message: 'Unit locked successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Unit not found or could not be locked'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to lock unit'
    });
  }
}));

// GET /units/assignments - Get unit assignments for the authenticated user
router.get('/assignments', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  try {
    const unitsService = UnitsService.getInstance();
    const assignments = await unitsService.getUnitAssignments(userId, userRole);

    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unit assignments'
    });
  }
}));

// POST /units - Create new unit (Admin, Dev Admin, Facility Admin only)
router.post('/', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const unitData = req.body;

  try {
    // Validate request body
    const { error, value } = createUnitSchema.validate(unitData);
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const unitsService = UnitsService.getInstance();
    const unit = await unitsService.createUnit(value, userId, userRole as UserRole);

    // Broadcast units update to all subscribers
    const wsService = WebSocketService.getInstance();
    await wsService.broadcastUnitsUpdate();
    
    // Also broadcast battery status update since unit creation may affect battery levels
    await wsService.broadcastBatteryStatusUpdate();

    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      unit
    });
  } catch (error: any) {
    if (error.message.includes('Access denied')) {
      res.status(403).json({
        success: false,
        message: error.message
      });
    } else if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create unit'
      });
    }
  }
}));

// PUT /units/:unitId - Update unit (Admin, Dev Admin, Facility Admin only)
router.put('/:unitId', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const unitId = req.params.unitId;
  const updateData = req.body;

  if (!userRole) {
    res.status(401).json({
      success: false,
      message: 'User role not found'
    });
    return;
  }

  if (!unitId) {
    res.status(400).json({
      success: false,
      message: 'Unit ID is required'
    });
    return;
  }

  try {
    // Validate the update data
    const { error, value } = updateUnitSchema.validate(updateData);
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const unitsService = UnitsService.getInstance();
    const unit = await unitsService.updateUnit(unitId, value, userId, userRole as UserRole);

    if (!unit) {
      res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
      return;
    }

    // Broadcast units update to all subscribers
    const wsService = WebSocketService.getInstance();
    await wsService.broadcastUnitsUpdate();
    
    // Also broadcast battery status update since unit updates may affect battery levels
    await wsService.broadcastBatteryStatusUpdate();

    res.json({
      success: true,
      message: 'Unit updated successfully',
      unit
    });
  } catch (error: any) {
    if (error.message.includes('Access denied')) {
      res.status(403).json({
        success: false,
        message: error.message
      });
    } else if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update unit'
      });
    }
  }
}));

// POST /units/:unitId/assign - Assign tenant to unit (Admin, Dev Admin, Facility Admin only)
router.post('/:unitId/assign', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { unitId } = req.params;
    const { tenant_id, access_type = 'full', expires_at, notes } = req.body;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    if (!unitId) {
      res.status(400).json({
        success: false,
        message: 'unitId is required'
      });
      return;
    }

    if (!tenant_id) {
      res.status(400).json({
        success: false,
        message: 'tenant_id is required'
      });
      return;
    }

    // Check if user has access to the unit
    const unitsService = UnitsService.getInstance();
    try {
      const hasAccess = await unitsService.hasUserAccessToUnit(unitId, userId, userRole);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this unit'
        });
        return;
      }
    } catch (error: any) {
      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          message: 'Unit not found'
        });
        return;
      }
      throw error;
    }

    // TODO: Implement actual tenant assignment logic
    // For now, return success with mock data
    res.status(200).json({
      success: true,
      message: 'Tenant assigned to unit successfully',
      data: {
        unit_id: unitId,
        tenant_id,
        access_type,
        expires_at,
        notes,
        assigned_at: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to assign tenant to unit'
    });
  }
}));

// DELETE /units/:unitId/assign/:tenantId - Remove tenant from unit (Admin, Dev Admin, Facility Admin only)
router.delete('/:unitId/assign/:tenantId', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { unitId, tenantId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    if (!unitId) {
      res.status(400).json({
        success: false,
        message: 'unitId is required'
      });
      return;
    }

    if (!tenantId) {
      res.status(400).json({
        success: false,
        message: 'tenantId is required'
      });
      return;
    }

    // Check if user has access to the unit
    const unitsService = UnitsService.getInstance();
    try {
      const hasAccess = await unitsService.hasUserAccessToUnit(unitId, userId, userRole);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this unit'
        });
        return;
      }
    } catch (error: any) {
      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          message: 'Unit not found'
        });
        return;
      }
      throw error;
    }

    // TODO: Implement actual tenant removal logic
    // For now, return success with mock data
    res.status(200).json({
      success: true,
      message: 'Tenant removed from unit successfully',
      data: {
        unit_id: unitId,
        tenant_id: tenantId,
        removed_at: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove tenant from unit'
    });
  }
}));

export { router as unitsRouter };