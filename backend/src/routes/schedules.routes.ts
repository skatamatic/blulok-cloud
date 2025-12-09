/**
 * Schedules Routes
 *
 * Comprehensive schedule management API providing CRUD operations for facility schedules.
 * Implements role-based access control with facility-scoped permissions.
 *
 * Key Features:
 * - Facility-scoped schedule management
 * - Time-based access control configuration
 * - User schedule assignment
 * - Precanned and custom schedules
 * - RBAC enforcement (admin, facility-admin, tenant, maintenance)
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full access to all schedules
 * - FACILITY_ADMIN: Access to schedules for assigned facilities only
 * - TENANT/MAINTENANCE: Read-only access to their own schedules
 *
 * Security Considerations:
 * - Facility-scoped access prevents unauthorized data access
 * - Input validation on all schedule data
 * - Permission checks before all operations
 * - Precanned schedules cannot be deleted
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireAdminOrFacilityAdmin, requireFacilityAccess, requireUserManagementOrSelf } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler, AppError } from '@/middleware/error.middleware';
import { SchedulesService, UserContext } from '@/services/schedules.service';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Validation schemas
const createScheduleSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  schedule_type: Joi.string().valid('precanned', 'custom').required(),
  is_active: Joi.boolean().optional(),
  time_windows: Joi.array().items(
    Joi.object({
      day_of_week: Joi.number().integer().min(0).max(6).required(),
      start_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
      end_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
    }).unknown(false) // Reject any additional fields like 'id'
  ).optional().default([]),
});

const updateScheduleSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  is_active: Joi.boolean().optional(),
  time_windows: Joi.array().items(
    Joi.object({
      day_of_week: Joi.number().integer().min(0).max(6).required(),
      start_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
      end_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
    }).unknown(false) // Reject any additional fields like 'id'
  ).optional(),
});

// Helper to create user context from request
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

// GET /api/v1/facilities/:facilityId/schedules - List schedules for facility
router.get('/facilities/:facilityId/schedules', requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId } = req.params;
  const userContext = getUserContext(req);

  const schedules = await SchedulesService.getSchedulesForFacility(facilityId, userContext);

  res.json({
    success: true,
    schedules,
    total: schedules.length,
  });
}));

// GET /api/v1/facilities/:facilityId/schedules/:scheduleId - Get schedule details
router.get('/facilities/:facilityId/schedules/:scheduleId', requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId, scheduleId } = req.params;
  const userContext = getUserContext(req);

  const schedule = await SchedulesService.getSchedule(facilityId, scheduleId, userContext);

  res.json({
    success: true,
    schedule,
  });
}));

// POST /api/v1/facilities/:facilityId/schedules - Create schedule
router.post('/facilities/:facilityId/schedules', requireAdminOrFacilityAdmin, requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId } = req.params;
  const userContext = getUserContext(req);

  const { error, value } = createScheduleSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0]?.message || 'Validation error', 400);
  }

  const schedule = await SchedulesService.createSchedule(
    facilityId,
    {
      name: value.name,
      schedule_type: value.schedule_type,
      is_active: value.is_active,
    },
    value.time_windows || [],
    userContext
  );

  res.status(201).json({
    success: true,
    schedule,
  });
}));

// PUT /api/v1/facilities/:facilityId/schedules/:scheduleId - Update schedule
router.put('/facilities/:facilityId/schedules/:scheduleId', requireAdminOrFacilityAdmin, requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId, scheduleId } = req.params;
  const userContext = getUserContext(req);

  const { error, value } = updateScheduleSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0]?.message || 'Validation error', 400);
  }

      const schedule = await SchedulesService.updateSchedule(
        facilityId,
        scheduleId,
        userContext,
        {
          name: value.name,
          is_active: value.is_active,
        },
        value.time_windows
      );

  res.json({
    success: true,
    schedule,
  });
}));

// GET /api/v1/facilities/:facilityId/schedules/:scheduleId/usage - Get schedule usage
router.get('/facilities/:facilityId/schedules/:scheduleId/usage', requireAdminOrFacilityAdmin, requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId, scheduleId } = req.params;
  const userContext = getUserContext(req);

  const usage = await SchedulesService.getScheduleUsage(facilityId, scheduleId, userContext);

  res.json({
    success: true,
    usage,
  });
}));

// DELETE /api/v1/facilities/:facilityId/schedules/:scheduleId - Delete schedule
router.delete('/facilities/:facilityId/schedules/:scheduleId', requireAdminOrFacilityAdmin, requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { facilityId, scheduleId } = req.params;
  const userContext = getUserContext(req);

  await SchedulesService.deleteSchedule(facilityId, scheduleId, userContext);

  res.json({
    success: true,
    message: 'Schedule deleted successfully',
  });
}));

// GET /api/v1/users/:userId/facilities/:facilityId/schedule - Get user's schedule for facility
router.get('/users/:userId/facilities/:facilityId/schedule', requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, facilityId } = req.params;
  const userContext = getUserContext(req);

  const schedule = await SchedulesService.getUserScheduleForFacility(userId, facilityId, userContext);

  res.json({
    success: true,
    schedule,
  });
}));

// PUT /api/v1/users/:userId/facilities/:facilityId/schedule - Set user's schedule for facility
router.put('/users/:userId/facilities/:facilityId/schedule', requireUserManagementOrSelf, requireFacilityAccess('facilityId'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, facilityId } = req.params;
  const userContext = getUserContext(req);

  const { scheduleId } = req.body;

  if (!scheduleId || typeof scheduleId !== 'string') {
    throw new AppError('scheduleId is required', 400);
  }

  const userSchedule = await SchedulesService.setUserSchedule(userId, facilityId, scheduleId, userContext);

  res.json({
    success: true,
    userSchedule,
  });
}));

export { router as schedulesRouter };

