import { Router, Response } from 'express';
import { authenticateToken, requireFacilityAccess } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { AccessControlService } from '@/services/access-control.service';
import { asyncHandler, NotFoundError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import { registerGet } from '@/openapi/register-route';
import {
  listDevicesQuerySchema,
  facilityIdParamSchema,
  deviceIdParamSchema,
  accessControlDevicesResponseSchema,
  accessControlSummaryResponseSchema,
  accessControlDeviceResponseSchema,
} from '@/schemas/access-control.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/access-control';

router.use(authenticateToken);

registerGet(
  router,
  '/facilities/:facilityId/devices',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/devices`,
    tags: ['AccessControl', 'App'],
    summary: 'List access control devices for a facility',
    security: 'bearer',
    params: facilityIdParamSchema,
    query: listDevicesQuerySchema,
    responses: {
      200: accessControlDevicesResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { deviceType, status, search, sortBy, sortOrder, limit, offset } = req.query;

    const service = AccessControlService.getInstance();

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
      },
    );

    res.json({
      success: true,
      devices: result.devices,
      total: result.total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

registerGet(
  router,
  '/facilities/:facilityId/summary',
  {
    openApiPath: `${MOUNT}/facilities/{facilityId}/summary`,
    tags: ['AccessControl', 'App'],
    summary: 'Get access control summary for a facility',
    security: 'bearer',
    params: facilityIdParamSchema,
    responses: {
      200: accessControlSummaryResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireFacilityAccess('facilityId'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    const service = AccessControlService.getInstance();
    const summary = await service.getFacilityAccessControlSummary(
      facilityId,
      user.userId,
      user.role,
      user.facilityIds,
    );

    res.json({
      success: true,
      ...summary,
    });
  }),
);

registerGet(
  router,
  '/devices/:deviceId',
  {
    openApiPath: `${MOUNT}/devices/{deviceId}`,
    tags: ['AccessControl', 'App'],
    summary: 'Get a single access control device',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: accessControlDeviceResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;

    const service = AccessControlService.getInstance();
    const device = await service.getAccessControlDeviceById(
      deviceId,
      user.userId,
      user.role,
      user.facilityIds,
    );

    if (!device) {
      throw new NotFoundError('Device');
    }

    res.json({
      success: true,
      device,
    });
  }),
);

export { router as accessControlRouter };
