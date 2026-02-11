/**
 * Access Control Routes
 *
 * API endpoints for querying facility access control devices (doors, gates, elevators).
 * These routes provide the mobile app with information about available access points
 * at a facility, enabling users to understand what they can access.
 *
 * Key Features:
 * - Query access control devices by facility
 * - Filter by device type (door, gate, elevator)
 * - Get device status and lock state
 * - Facility-scoped access control
 *
 * Access Control:
 * - All authenticated users can query devices
 * - Device visibility is filtered by facility access
 * - Tenants see devices at facilities they have access to
 * - Admins see all devices across all facilities
 *
 * Endpoints:
 * - GET /facilities/:facilityId/devices - List access control devices
 * - GET /facilities/:facilityId/summary - Get facility access control summary
 * - GET /devices/:deviceId - Get single device details
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireFacilityAccess } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { AccessControlService } from '@/services/access-control.service';
import { asyncHandler, NotFoundError } from '@/middleware/error.middleware';
import { validate } from '@/middleware/validator.middleware';
import { logger } from '@/utils/logger';

const router = Router();

// Validation schemas
const listDevicesQuerySchema = Joi.object({
  deviceType: Joi.string().valid('door', 'gate', 'elevator').optional(),
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional(),
  search: Joi.string().max(200).optional(),
  sortBy: Joi.string().valid('name', 'device_type', 'status', 'last_activity').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// Path parameter validation schemas
const facilityIdParamSchema = Joi.object({
  facilityId: Joi.string().uuid().required(),
});

const deviceIdParamSchema = Joi.object({
  deviceId: Joi.string().uuid().required(),
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/v1/access-control/facilities/:facilityId/devices
 * 
 * Get all access control devices for a facility.
 * Returns doors, gates, and elevators with their current status.
 */
router.get(
  '/facilities/:facilityId/devices',
  validate(facilityIdParamSchema, 'params'),
  requireFacilityAccess('facilityId'),
  validate(listDevicesQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { deviceType, status, search, sortBy, sortOrder, limit, offset } = req.query;

    const service = AccessControlService.getInstance();

    // Note: Facility access is already validated by requireFacilityAccess middleware
    const result = await service.getAccessControlDevices(
      facilityId,
      user.userId,
      user.role,
      user.facilityIds,
      {
        deviceType: deviceType as 'door' | 'gate' | 'elevator' | undefined,
        status: status as 'online' | 'offline' | 'error' | 'maintenance' | undefined,
        search: search as string | undefined,
        sortBy: sortBy as string | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      devices: result.devices,
      total: result.total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

/**
 * GET /api/v1/access-control/facilities/:facilityId/summary
 * 
 * Get a summary of all access control devices at a facility.
 * Includes device counts by type and status.
 */
router.get(
  '/facilities/:facilityId/summary',
  validate(facilityIdParamSchema, 'params'),
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    const service = AccessControlService.getInstance();

    // Note: Facility access is already validated by requireFacilityAccess middleware
    const summary = await service.getFacilityAccessControlSummary(
      facilityId,
      user.userId,
      user.role,
      user.facilityIds
    );

    res.json({
      success: true,
      ...summary,
    });
  })
);

/**
 * GET /api/v1/access-control/devices/:deviceId
 * 
 * Get a single access control device by ID.
 * User must have access to the facility the device belongs to.
 */
router.get(
  '/devices/:deviceId',
  validate(deviceIdParamSchema, 'params'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;

    const service = AccessControlService.getInstance();

    // Authorization is checked in the service layer based on device's facility
    const device = await service.getAccessControlDeviceById(
      deviceId,
      user.userId,
      user.role,
      user.facilityIds
    );

    if (!device) {
      throw new NotFoundError('Device');
    }

    res.json({
      success: true,
      device,
    });
  })
);

export { router as accessControlRouter };
