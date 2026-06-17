/**
 * Activity Routes
 *
 * API endpoints for querying activity logs (unit state changes, lock events, etc.).
 * Provides read-only access to historical activity data with proper RBAC enforcement.
 *
 * Key Features:
 * - Query activity logs with filtering
 * - Get activity by facility, unit, or device
 * - Support for date range filtering
 * - Facility-scoped access control
 *
 * Access Control:
 * - All authenticated users can query activity
 * - Results are filtered by facility access
 * - Tenants can only see activity for their assigned units
 * - Admins can see all activity
 *
 * Endpoints:
 * - GET /activity - Get activity logs with filters
 * - GET /activity/facilities/:facilityId - Get facility activity
 * - GET /activity/units/:unitId - Get unit activity
 * - GET /activity/devices/:deviceId - Get device activity
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireFacilityAccess } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { ActivityService } from '@/services/activity.service';
import { asyncHandler } from '@/middleware/error.middleware';
import { validate } from '@/middleware/validator.middleware';
import { logger } from '@/utils/logger';
import { parseQueryDateFrom, parseQueryDateTo } from '@/utils/datetime.utils';

const router = Router();

// Validation schemas
const listQuerySchema = Joi.object({
  entityType: Joi.string().valid('unit', 'device', 'facility', 'user', 'gateway').optional(),
  entityId: Joi.string().uuid().optional(),
  activityType: Joi.string().valid(
    'lock',
    'unlock',
    'locking',
    'unlocking',
    'access_attempt',
    'status_change',
    'error',
    'maintenance_start',
    'maintenance_end',
    'assignment_change',
    'configuration_change',
    'connection_change',
    'general'
  ).optional(),
  actorType: Joi.string().valid('user', 'system', 'device', 'gateway').optional(),
  actorId: Joi.string().uuid().optional(),
  result: Joi.string().valid('success', 'failure', 'pending', 'unknown').optional(),
  facilityId: Joi.string().uuid().optional(),
  unitId: Joi.string().uuid().optional(),
  deviceId: Joi.string().uuid().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const facilityActivityQuerySchema = Joi.object({
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const paginationQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// Path parameter validation schemas
const facilityIdParamSchema = Joi.object({
  facilityId: Joi.string().uuid().required(),
});

const unitIdParamSchema = Joi.object({
  unitId: Joi.string().uuid().required(),
});

const deviceIdParamSchema = Joi.object({
  deviceId: Joi.string().uuid().required(),
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/v1/activity
 * 
 * Get activity logs with optional filters.
 * Results are filtered based on user's facility access.
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const {
      entityType,
      entityId,
      activityType,
      actorType,
      actorId,
      result,
      facilityId,
      unitId,
      deviceId,
      fromDate,
      toDate,
      limit,
      offset,
    } = req.query;

    const service = ActivityService.getInstance();

    const activityResult = await service.getActivityLogs(
      user.userId,
      user.role,
      user.facilityIds,
      {
        entityType: entityType as any,
        entityId: entityId as string,
        activityType: activityType as any,
        actorType: actorType as any,
        actorId: actorId as string,
        result: result as any,
        facilityId: facilityId as string,
        unitId: unitId as string,
        deviceId: deviceId as string,
        fromDate: fromDate ? parseQueryDateFrom(fromDate as string) : undefined,
        toDate: toDate ? parseQueryDateTo(toDate as string) : undefined,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      activities: activityResult.activities,
      total: activityResult.total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

/**
 * GET /api/v1/activity/facilities/:facilityId
 * 
 * Get activity logs for a specific facility.
 */
router.get(
  '/facilities/:facilityId',
  validate(facilityIdParamSchema, 'params'),
  requireFacilityAccess('facilityId'),
  validate(facilityActivityQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { fromDate, toDate, limit, offset } = req.query;

    const service = ActivityService.getInstance();

    // Note: Facility access is already validated by requireFacilityAccess middleware
    const result = await service.getFacilityActivity(
      user.userId,
      user.role,
      user.facilityIds,
      facilityId,
      {
        fromDate: fromDate ? parseQueryDateFrom(fromDate as string) : undefined,
        toDate: toDate ? parseQueryDateTo(toDate as string) : undefined,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      facilityId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

/**
 * GET /api/v1/activity/units/:unitId
 * 
 * Get activity logs for a specific unit.
 */
router.get(
  '/units/:unitId',
  validate(unitIdParamSchema, 'params'),
  validate(paginationQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { unitId } = req.params;
    const { limit, offset } = req.query;

    const service = ActivityService.getInstance();

    // Authorization is checked in the service layer based on unit's facility
    const result = await service.getUnitActivity(
      user.userId,
      user.role,
      user.facilityIds,
      unitId,
      {
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      unitId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

/**
 * GET /api/v1/activity/devices/:deviceId
 * 
 * Get activity logs for a specific device.
 */
router.get(
  '/devices/:deviceId',
  validate(deviceIdParamSchema, 'params'),
  validate(paginationQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;
    const { limit, offset } = req.query;

    const service = ActivityService.getInstance();

    // Authorization is checked in the service layer based on device's facility
    const result = await service.getDeviceActivity(
      user.userId,
      user.role,
      user.facilityIds,
      deviceId,
      {
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      deviceId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

export { router as activityRouter };
