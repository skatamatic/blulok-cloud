/**
 * Units Routes
 *
 * Comprehensive storage unit management API providing CRUD operations for rental units.
 * Implements role-based access control with unit-scoped permissions and real-time updates.
 *
 * Key Features:
 * - Multi-tenant unit management with access control
 * - Unit status monitoring (locked/unlocked/occupied)
 * - Assignment management for tenant-unit relationships
 * - Real-time status updates via WebSocket
 * - Unit search and filtering capabilities
 * - Lock control operations for authorized users
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full unit management across all facilities
 * - FACILITY_ADMIN: Management of units in assigned facilities
 * - TENANT: Access to assigned units only (read + lock control)
 * - MAINTENANCE: Access to units for maintenance operations
 *
 * Unit Operations:
 * - Create units with facility association and configuration
 * - Update unit details, pricing, and availability
 * - Assign/unassign tenants to units
 * - Control unit locks (unlock for authorized access)
 * - Monitor unit status and occupancy
 * - Search and filter units by various criteria
 *
 * Security Considerations:
 * - Unit-scoped access prevents cross-tenant operations
 * - Lock control requires proper authorization
 * - Assignment validation prevents conflicts
 * - Audit logging for all unit operations
 * - Secure lock control prevents replay attacks
 */

import { Router, Response } from 'express';
import { UnitsService } from '@/services/units.service';
import { UnitModel } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { WebSocketService } from '@/services/websocket.service';
import {
  createUnitSchema,
  updateUnitSchema,
  unitIdParamSchema,
  unitIdTenantIdParamSchema,
  assignUnitTenantBodySchema,
  unitDetailResponseSchema,
  unitsMyResponseSchema,
  unitAssignmentsResponseSchema,
  unitMutationResponseSchema,
  unitLockResponseSchema,
  unitDeleteResponseSchema,
  unitAssignResponseSchema,
  unitUnassignResponseSchema,
} from '@/schemas/unit.schemas';
import { unitsListQuerySchema, unitsListResponseSchema } from '@/schemas/units-list.schemas';
import { logger } from '@/utils/logger';
import { handleGetUnitsList } from '@/routes/units-list.handler';
import { registerGet, registerPost, registerPut, registerDelete } from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/units';

router.use(authenticateToken as any);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Units', 'App'],
    summary: 'List units for the authenticated user',
    security: 'bearer',
    query: unitsListQuerySchema,
    responses: {
      200: unitsListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await handleGetUnitsList(req, res);
  }),
);

registerGet(
  router,
  '/unlocked',
  {
    openApiPath: `${MOUNT}/unlocked`,
    tags: ['Units', 'App'],
    summary: 'List unlocked units for the authenticated user',
    security: 'bearer',
    query: unitsListQuerySchema,
    responses: {
      200: unitsListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await handleGetUnitsList(req, res, {
      extraFilters: { lock_status: 'unlocked' },
      errorMessage: 'Failed to fetch unlocked units',
    });
  }),
);

registerGet(
  router,
  '/my',
  {
    openApiPath: `${MOUNT}/my`,
    tags: ['Units', 'App'],
    summary: 'Get my units (tenant only)',
    security: 'bearer',
    responses: {
      200: unitsMyResponseSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.TENANT]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  }),
);

registerGet(
  router,
  '/:unitId',
  {
    openApiPath: `${MOUNT}/{unitId}`,
    tags: ['Units', 'App'],
    summary: 'Get unit details by ID',
    security: 'bearer',
    params: unitIdParamSchema,
    responses: {
      200: unitDetailResponseSchema,
      401: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  }),
);

registerPost(
  router,
  '/:unitId/lock',
  {
    openApiPath: `${MOUNT}/{unitId}/lock`,
    tags: ['Units', 'App'],
    summary: 'Lock a specific unit',
    security: 'bearer',
    params: unitIdParamSchema,
    responses: {
      200: unitLockResponseSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { unitId } = req.params;
    const userId = req.user!.userId;

    try {
      const unitsService = UnitsService.getInstance();
      const success = await unitsService.lockUnit(unitId, userId);

      if (success) {
        const wsService = WebSocketService.getInstance();
        await wsService.broadcastUnitsUpdate();
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
  }),
);

registerGet(
  router,
  '/assignments',
  {
    openApiPath: `${MOUNT}/assignments`,
    tags: ['Units', 'App'],
    summary: 'Get unit assignments for the authenticated user',
    security: 'bearer',
    responses: {
      200: unitAssignmentsResponseSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Units', 'App'],
    summary: 'Create a new unit',
    security: 'bearer',
    body: createUnitSchema,
    legacyValidationErrors: true,
    responses: {
      201: unitMutationResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    try {
      const unitsService = UnitsService.getInstance();
      const unit = await unitsService.createUnit(req.body, userId, userRole as UserRole);

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastUnitsUpdate();
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
  }),
);

registerPut(
  router,
  '/:unitId',
  {
    openApiPath: `${MOUNT}/{unitId}`,
    tags: ['Units', 'App'],
    summary: 'Update a unit',
    security: 'bearer',
    params: unitIdParamSchema,
    body: updateUnitSchema,
    legacyValidationErrors: true,
    responses: {
      200: unitMutationResponseSchema,
      400: errorEnvelopeSchema,
      401: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    try {
      const unitsService = UnitsService.getInstance();
      const unit = await unitsService.updateUnit(unitId, req.body, userId, userRole as UserRole);

      if (!unit) {
        res.status(404).json({
          success: false,
          message: 'Unit not found'
        });
        return;
      }

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastUnitsUpdate();
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
      } else if (error.message.includes('Cannot set unit to available or reserved')) {
        res.status(400).json({
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
  }),
);

registerDelete(
  router,
  '/:unitId',
  {
    openApiPath: `${MOUNT}/{unitId}`,
    tags: ['Units', 'App'],
    summary: 'Delete a unit',
    security: 'bearer',
    params: unitIdParamSchema,
    responses: {
      200: unitDeleteResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const userRole = req.user!.role as UserRole;
    const unitId = req.params.unitId;

    try {
      const unitsService = UnitsService.getInstance();
      await unitsService.deleteUnit(unitId, userId, userRole);

      const wsService = WebSocketService.getInstance();
      await wsService.broadcastUnitsUpdate();
      await wsService.broadcastBatteryStatusUpdate();

      res.json({
        success: true,
        message: 'Unit deleted successfully',
        data: { unit_id: unitId, deleted_at: new Date().toISOString() },
      });
    } catch (error: any) {
      if (error.message?.includes('Access denied')) {
        res.status(403).json({ success: false, message: error.message });
        return;
      }
      if (error.message?.includes('not found')) {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      logger.error('Error deleting unit:', error);
      res.status(500).json({ success: false, message: 'Failed to delete unit' });
    }
  }),
);

registerPost(
  router,
  '/:unitId/assign',
  {
    openApiPath: `${MOUNT}/{unitId}/assign`,
    tags: ['Units', 'App'],
    summary: 'Assign tenant to unit',
    security: 'bearer',
    params: unitIdParamSchema,
    body: assignUnitTenantBodySchema,
    responses: {
      200: unitAssignResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN, UserRole.TENANT]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { unitId } = req.params;
      const { tenant_id, access_type = 'full', expires_at, notes } = req.body;
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      const unitsService = UnitsService.getInstance();
      const unitModel = new UnitModel();

      let unit;
      try {
        unit = await unitModel.findById(unitId);
        if (!unit) {
          res.status(404).json({
            success: false,
            message: 'Unit not found'
          });
          return;
        }
      } catch (error: any) {
        throw error;
      }

      const isPrimary = req.body.is_primary ?? false;
      const canManageUnits = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole as UserRole);

      if (!canManageUnits) {
        const hasAccess = await unitsService.hasUserAccessToUnit(unit.id, userId, userRole);
        if (!hasAccess) {
          res.status(403).json({
            success: false,
            message: 'Access denied to this unit'
          });
          return;
        }

        const actingAssignment = await new UnitAssignmentModel().findByUnitAndTenant(unit.id, userId);
        const isPrimaryTenantOfUnit = !!actingAssignment?.is_primary;

        if (!isPrimaryTenantOfUnit) {
          res.status(403).json({
            success: false,
            message: 'Only admins or the primary tenant can manage unit access'
          });
          return;
        }

        if (isPrimary) {
          res.status(403).json({
            success: false,
            message: 'Primary tenant cannot change the primary assignment. Only facility administrators can do this.'
          });
          return;
        }
      }

      if (userRole === UserRole.FACILITY_ADMIN) {
        const hasAccess = await unitsService.hasUserAccessToUnit(unit.id, userId, userRole);
        if (!hasAccess) {
          res.status(403).json({
            success: false,
            message: 'Access denied to this unit'
          });
          return;
        }
      }

      try {
        const assignOptions: any = {
          accessType: access_type || 'full',
          isPrimary,
          notes,
          performedBy: userId,
          source: 'api'
        };

        if (expires_at) {
          assignOptions.expiresAt = new Date(expires_at);
        }

        await unitsService.assignTenant(unitId, tenant_id, assignOptions);

        res.status(200).json({
          success: true,
          message: `Tenant ${isPrimary ? 'assigned as primary' : 'granted shared access'} successfully`
        });
      } catch (error: any) {
        logger.error('Error assigning tenant:', error);
        res.status(400).json({
          success: false,
          message: error.message || 'Failed to assign tenant to unit'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to assign tenant to unit'
      });
    }
  }),
);

registerDelete(
  router,
  '/:unitId/assign/:tenantId',
  {
    openApiPath: `${MOUNT}/{unitId}/assign/{tenantId}`,
    tags: ['Units', 'App'],
    summary: 'Remove tenant from unit',
    security: 'bearer',
    params: unitIdTenantIdParamSchema,
    responses: {
      200: unitUnassignResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN, UserRole.TENANT]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { unitId, tenantId } = req.params;
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      const unitsService = UnitsService.getInstance();
      const unitModel = new UnitModel();
      const unitAssignmentModel = new UnitAssignmentModel();

      let unit;
      try {
        unit = await unitModel.findById(unitId);
        if (!unit) {
          res.status(404).json({
            success: false,
            message: 'Unit not found'
          });
          return;
        }
      } catch (error: any) {
        throw error;
      }

      const assignment = await unitAssignmentModel.findByUnitAndTenant(unitId, tenantId);
      if (!assignment) {
        res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
        return;
      }

      const canManageUnits = [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole as UserRole);
      if (!canManageUnits) {
        const hasAccess = await unitsService.hasUserAccessToUnit(unit.id, userId, userRole);
        if (!hasAccess) {
          res.status(403).json({
            success: false,
            message: 'Access denied to this unit'
          });
          return;
        }

        const actingAssignment = await unitAssignmentModel.findByUnitAndTenant(unit.id, userId);
        const isPrimaryTenantOfUnit = !!actingAssignment?.is_primary;

        if (!isPrimaryTenantOfUnit) {
          res.status(403).json({
            success: false,
            message: 'Only admins or the primary tenant can manage unit access'
          });
          return;
        }

        if (assignment.is_primary) {
          res.status(403).json({
            success: false,
            message: 'Cannot remove the primary tenant. Only facility administrators can do this.'
          });
          return;
        }
      }

      if (userRole === UserRole.FACILITY_ADMIN) {
        const hasAccess = await unitsService.hasUserAccessToUnit(unit.id, userId, userRole);
        if (!hasAccess) {
          res.status(403).json({
            success: false,
            message: 'Access denied to this unit'
          });
          return;
        }
      }

      try {
        await unitsService.unassignTenant(unitId, tenantId, {
          performedBy: userId,
          source: 'api'
        });

        res.status(200).json({
          success: true,
          message: 'Tenant access removed successfully',
          data: {
            unit_id: unitId,
            tenant_id: tenantId,
            removed_at: new Date().toISOString()
          }
        });
      } catch (error: any) {
        logger.error('Error removing tenant:', error);
        res.status(400).json({
          success: false,
          message: error.message || 'Failed to remove tenant from unit'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to remove tenant from unit'
      });
    }
  }),
);

export { router as unitsRouter };
