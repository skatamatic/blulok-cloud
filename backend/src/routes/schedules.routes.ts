/**
 * Schedules Routes
 *
 * Comprehensive schedule management API providing CRUD operations for facility schedules.
 * Implements role-based access control with facility-scoped permissions.
 */

import { Router, Response } from 'express';
import { authenticateToken, requireAdminOrFacilityAdmin, requireFacilityAccess, requireUserManagementOrSelf } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler, AppError } from '@/middleware/error.middleware';
import { SchedulesService, UserContext } from '@/services/schedules.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  createScheduleSchema,
  updateScheduleSchema,
  scheduleFacilityIdParamSchema,
  scheduleIdParamSchema,
  userScheduleParamSchema,
  setUserScheduleSchema,
  schedulesResponseSchema,
} from '@/schemas/schedules.schemas';

const router = Router();
const MOUNT = '/api/v1';

router.use(authenticateToken);

const getUserContext = (req: AuthenticatedRequest): UserContext => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }
  return {
    userId: req.user.userId,
    role: req.user.role,
    facilityIds: req.user.facilityIds,
  };
};

registerGet(
  router,
  '/facilities/:facilityId/schedules',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules`,
    tags: ['Schedules'],
    summary: 'List schedules for a facility',
    security: 'bearer',
    params: scheduleFacilityIdParamSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId } = req.params;
    const userContext = getUserContext(req);

    const schedules = await SchedulesService.getSchedulesForFacility(facilityId, userContext);

    res.json({
      success: true,
      schedules,
      total: schedules.length,
    });
  }),
);

registerGet(
  router,
  '/facilities/:facilityId/schedules/:scheduleId',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules/{scheduleId}`,
    tags: ['Schedules'],
    summary: 'Get schedule details',
    security: 'bearer',
    params: scheduleIdParamSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId, scheduleId } = req.params;
    const userContext = getUserContext(req);

    const schedule = await SchedulesService.getSchedule(facilityId, scheduleId, userContext);

    res.json({
      success: true,
      schedule,
    });
  }),
);

registerPost(
  router,
  '/facilities/:facilityId/schedules',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules`,
    tags: ['Schedules'],
    summary: 'Create a schedule',
    security: 'bearer',
    params: scheduleFacilityIdParamSchema,
    body: createScheduleSchema,
    responses: {
      201: schedulesResponseSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId } = req.params;
    const userContext = getUserContext(req);
    const value = req.body;

    const schedule = await SchedulesService.createSchedule(
      facilityId,
      {
        name: value.name,
        schedule_type: value.schedule_type,
        is_active: value.is_active,
      },
      value.time_windows || [],
      userContext,
    );

    res.status(201).json({
      success: true,
      schedule,
    });
  }),
);

registerPut(
  router,
  '/facilities/:facilityId/schedules/:scheduleId',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules/{scheduleId}`,
    tags: ['Schedules'],
    summary: 'Update a schedule',
    security: 'bearer',
    params: scheduleIdParamSchema,
    body: updateScheduleSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId, scheduleId } = req.params;
    const userContext = getUserContext(req);
    const value = req.body;

    const schedule = await SchedulesService.updateSchedule(
      facilityId,
      scheduleId,
      userContext,
      {
        name: value.name,
        is_active: value.is_active,
      },
      value.time_windows,
    );

    res.json({
      success: true,
      schedule,
    });
  }),
);

registerGet(
  router,
  '/facilities/:facilityId/schedules/:scheduleId/usage',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules/{scheduleId}/usage`,
    tags: ['Schedules'],
    summary: 'Get schedule usage',
    security: 'bearer',
    params: scheduleIdParamSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId, scheduleId } = req.params;
    const userContext = getUserContext(req);

    const usage = await SchedulesService.getScheduleUsage(facilityId, scheduleId, userContext);

    res.json({
      success: true,
      usage,
    });
  }),
);

registerDelete(
  router,
  '/facilities/:facilityId/schedules/:scheduleId',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/schedules/{scheduleId}`,
    tags: ['Schedules'],
    summary: 'Delete a schedule',
    security: 'bearer',
    params: scheduleIdParamSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facilityId, scheduleId } = req.params;
    const userContext = getUserContext(req);

    await SchedulesService.deleteSchedule(facilityId, scheduleId, userContext);

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  }),
);

registerGet(
  router,
  '/users/:userId/facilities/:facilityId/schedule',
  {
    openApiPath: `${MOUNT}/users/{userId}/facilities/{facilityId}/schedule`,
    tags: ['Schedules'],
    summary: 'Get user schedule for facility',
    security: 'bearer',
    params: userScheduleParamSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId, facilityId } = req.params;
    const userContext = getUserContext(req);

    const schedule = await SchedulesService.getUserScheduleForFacility(userId, facilityId, userContext);

    res.json({
      success: true,
      schedule,
    });
  }),
);

registerPut(
  router,
  '/users/:userId/facilities/:facilityId/schedule',
  {
    openApiPath: `${MOUNT}/users/{userId}/facilities/{facilityId}/schedule`,
    tags: ['Schedules'],
    summary: 'Set user schedule for facility',
    security: 'bearer',
    params: userScheduleParamSchema,
    body: setUserScheduleSchema,
    responses: {
      200: schedulesResponseSchema,
    },
  },
  requireUserManagementOrSelf,
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId, facilityId } = req.params;
    const userContext = getUserContext(req);
    const { scheduleId } = req.body;

    const userSchedule = await SchedulesService.setUserSchedule(userId, facilityId, scheduleId, userContext);

    res.json({
      success: true,
      userSchedule,
    });
  }),
);

export { router as schedulesRouter };
