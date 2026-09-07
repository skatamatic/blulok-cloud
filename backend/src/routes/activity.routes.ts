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
import { authenticateToken, requireFacilityAccess } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { ActivityService } from '@/services/activity.service';
import { asyncHandler } from '@/middleware/error.middleware';
import { parseQueryDateFrom, parseQueryDateTo } from '@/utils/datetime.utils';
import { registerGet } from '@/openapi/register-route';
import {
  activityListQuerySchema,
  facilityActivityQuerySchema,
  activityPaginationQuerySchema,
  activityFacilityIdParamSchema,
  activityUnitIdParamSchema,
  activityDeviceIdParamSchema,
  activityListResponseSchema,
} from '@/schemas/activity.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/activity';

router.use(authenticateToken);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Activity'],
    summary: 'Get activity logs with optional filters',
    security: 'bearer',
    query: activityListQuerySchema,
    responses: {
      200: activityListResponseSchema,
    },
  },
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
      },
    );

    res.json({
      success: true,
      activities: activityResult.activities,
      total: activityResult.total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

registerGet(
  router,
  '/facilities/:facilityId',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}`,
    tags: ['Activity'],
    summary: 'Get activity logs for a specific facility',
    security: 'bearer',
    params: activityFacilityIdParamSchema,
    query: facilityActivityQuerySchema,
    responses: {
      200: activityListResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { fromDate, toDate, limit, offset } = req.query;

    const service = ActivityService.getInstance();

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
      },
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      facilityId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

registerGet(
  router,
  '/units/:unitId',
  {
    openApiPath: `${MOUNT}/units/{unitId}`,
    tags: ['Activity'],
    summary: 'Get activity logs for a specific unit',
    security: 'bearer',
    params: activityUnitIdParamSchema,
    query: activityPaginationQuerySchema,
    responses: {
      200: activityListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { unitId } = req.params;
    const { limit, offset } = req.query;

    const service = ActivityService.getInstance();

    const result = await service.getUnitActivity(
      user.userId,
      user.role,
      user.facilityIds,
      unitId,
      {
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      },
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      unitId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

registerGet(
  router,
  '/devices/:deviceId',
  {
    openApiPath: `${MOUNT}/devices/{deviceId}`,
    tags: ['Activity'],
    summary: 'Get activity logs for a specific device',
    security: 'bearer',
    params: activityDeviceIdParamSchema,
    query: activityPaginationQuerySchema,
    responses: {
      200: activityListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;
    const { limit, offset } = req.query;

    const service = ActivityService.getInstance();

    const result = await service.getDeviceActivity(
      user.userId,
      user.role,
      user.facilityIds,
      deviceId,
      {
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      },
    );

    res.json({
      success: true,
      activities: result.activities,
      total: result.total,
      deviceId,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

export { router as activityRouter };
