/**
 * Firmware Routes
 *
 * REST API for firmware management and push operations.
 *
 * Upload: DEV_ADMIN only (via DevTools)
 * List/Details: ADMIN, DEV_ADMIN, FACILITY_ADMIN (catalog is global)
 * Push/Status/History/Cancel: ADMIN, DEV_ADMIN, FACILITY_ADMIN (facility-scoped for FACILITY_ADMIN)
 * Delete: DEV_ADMIN only
 *
 * IMPORTANT: Specific path routes (push-status, push-history, push/:pushId/cancel)
 * must be declared BEFORE the /:id wildcard to avoid route conflicts.
 */

import { Router, Response, RequestHandler, NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { FirmwareService } from '@/services/firmware/firmware.service';
import { FIRMWARE_MAX_SIZE_BYTES, FIRMWARE_MAX_SIZE_MB } from '@/services/firmware/firmware-storage.factory';
import { FirmwareTargetType } from '@/models/firmware.model';
import { FirmwarePushEventType } from '@/models/firmware-push-event.model';
import { GatewayModel } from '@/models/gateway.model';
import { FirmwarePushEventModel } from '@/models/firmware-push-event.model';
import { logger } from '@/utils/logger';
import {
  registerGet,
  registerPost,
  registerDelete,
} from '@/openapi/register-route';
import {
  firmwareUploadSchema,
  firmwareInitUploadSchema,
  firmwareCompleteUploadSchema,
  firmwareListQuerySchema,
  firmwarePushStatusQuerySchema,
  firmwarePushHistoryQuerySchema,
  firmwarePushEventsQuerySchema,
  firmwareIdParamSchema,
  firmwareGatewayIdParamSchema,
  firmwarePushIdParamSchema,
  firmwarePushGatewayParamSchema,
  firmwareResponseSchema,
} from '@/schemas/firmware.schemas';

const pushEventModel = new FirmwarePushEventModel();

const router = Router();
const MOUNT = '/api/v1/firmware';
const gatewayModel = new GatewayModel();

interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FIRMWARE_MAX_SIZE_BYTES },
});

// ============================================================================
// Role Guards
// ============================================================================

const requireDevAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'DEV_ADMIN role required' });
    return;
  }
  next();
};

const requireAdminOrFacilityAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const role = req.user?.role;
  if (role !== UserRole.ADMIN && role !== UserRole.DEV_ADMIN && role !== UserRole.FACILITY_ADMIN) {
    res.status(403).json({ success: false, message: 'Admin or Facility Admin role required' });
    return;
  }
  next();
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip internal fields (storage_path) from firmware images before returning to clients.
 */
function sanitizeFirmwareImage(fw: any): any {
  if (!fw) return fw;
  const { storage_path, ...safe } = fw;
  return safe;
}

/**
 * Verify that a FACILITY_ADMIN user is authorized for the given gateway's facility.
 * ADMIN and DEV_ADMIN are always authorized.
 * Returns the gateway's facility_id on success, or sends a 403 response and returns null.
 */
async function assertFacilityAccess(
  req: AuthenticatedRequest,
  res: Response,
  gatewayId: string,
): Promise<string | null> {
  const gw = await gatewayModel.findById(gatewayId);
  if (!gw) {
    res.status(404).json({ success: false, message: 'Gateway not found' });
    return null;
  }
  if (req.user?.role === UserRole.FACILITY_ADMIN) {
    const allowed = req.user.facilityIds || [];
    if (!gw.facility_id || !allowed.includes(gw.facility_id)) {
      res.status(403).json({ success: false, message: 'You do not have access to this gateway\'s facility' });
      return null;
    }
  }
  if (!gw.facility_id) {
    res.status(409).json({ success: false, message: 'Gateway is not assigned to a facility' });
    return null;
  }
  return gw.facility_id;
}

// ============================================================================
// Upload firmware binary (DEV_ADMIN only)
// ============================================================================

const VALID_TARGET_TYPES: readonly FirmwareTargetType[] = ['gateway', 'lock', 'friend_node', 'access_control'];

function parseCompatibleModels(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const models = raw.split(',').map((m: string) => m.trim()).filter(Boolean);
  return models.length > 0 ? models : undefined;
}

function parseUploadMetadata(value: {
  version: string;
  target_type?: string;
  description?: string;
  release_notes?: string;
  compatible_models?: string;
  minimum_version?: string;
}) {
  return {
    version: value.version,
    target_type: (value.target_type || 'gateway') as FirmwareTargetType,
    description: value.description || undefined,
    release_notes: value.release_notes || undefined,
    compatible_models: parseCompatibleModels(value.compatible_models),
    minimum_version: value.minimum_version || undefined,
  };
}

function handleFirmwareUploadError(err: any, res: Response): boolean {
  if (err?.message?.includes('already exists') || err?.message?.includes('validation failed')) {
    res.status(400).json({ success: false, message: err.message });
    return true;
  }
  if (err?.message?.includes('not found in storage') || err?.message?.includes('size mismatch')) {
    res.status(400).json({ success: false, message: err.message });
    return true;
  }
  const message = String(err?.message || '');
  if (
    message.includes('signBlob')
    || message.includes('Failed to create upload session')
    || err?.code === 'PERMISSION_DENIED'
  ) {
    res.status(503).json({
      success: false,
      message:
        'Firmware storage is not configured for direct uploads. Grant the Cloud Run service account '
        + 'storage.objectCreator (and storage.objectViewer for finalize) on the firmware bucket.',
    });
    return true;
  }
  return false;
}

registerPost(
  router,
  '/upload',
  {
    openApiPath: `${MOUNT}/upload`,
    tags: ['Firmware'],
    summary: 'Upload firmware binary or manage direct upload session',
    security: 'bearer',
    responses: {
      200: firmwareResponseSchema,
      201: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireDevAdmin,
  (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      next();
      return;
    }
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            message: `Firmware file exceeds maximum size of ${FIRMWARE_MAX_SIZE_MB}MB`,
          });
          return;
        }
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  },
  asyncHandler(async (req: MulterRequest, res: Response): Promise<void> => {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      const phase = req.body?.phase;
      if (phase === 'prepare') {
        const { error, value } = firmwareInitUploadSchema.validate(req.body);
        if (error) {
          res.status(400).json({ success: false, message: error.message });
          return;
        }
        try {
          const clientOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
          const session = await FirmwareService.initFirmwareUpload(
            { originalname: value.filename, size: value.size_bytes },
            parseUploadMetadata(value),
            clientOrigin,
          );
          res.status(200).json({ success: true, data: session });
        } catch (err: any) {
          if (handleFirmwareUploadError(err, res)) return;
          throw err;
        }
        return;
      }

      if (phase === 'finalize') {
        const { error, value } = firmwareCompleteUploadSchema.validate(req.body);
        if (error) {
          res.status(400).json({ success: false, message: error.message });
          return;
        }
        try {
          const firmware = await FirmwareService.completeFirmwareUpload(
            value.upload_id,
            { originalname: value.filename, size: value.size_bytes },
            parseUploadMetadata(value),
            req.user!.userId,
          );
          logger.info(`Firmware upload completed: version=${firmware.version} size=${firmware.size_bytes} by=${req.user!.userId}`);
          res.status(201).json({ success: true, data: sanitizeFirmwareImage(firmware) });
        } catch (err: any) {
          if (handleFirmwareUploadError(err, res)) return;
          throw err;
        }
        return;
      }

      res.status(400).json({ success: false, message: 'JSON uploads require phase "prepare" or "finalize"' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const { error, value } = firmwareUploadSchema.validate(req.body);
    if (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

    // Parse compatible_models from comma-separated string
    const compatibleModels = parseCompatibleModels(value.compatible_models);

    try {
      const firmware = await FirmwareService.uploadFirmware(
        { originalname: file.originalname, buffer: file.buffer, size: file.size },
        {
          version: value.version,
          target_type: value.target_type || 'gateway',
          description: value.description || undefined,
          release_notes: value.release_notes || undefined,
          compatible_models: compatibleModels,
          minimum_version: value.minimum_version || undefined,
        },
        req.user!.userId,
      );

      logger.info(`Firmware uploaded: version=${firmware.version} size=${firmware.size_bytes} by=${req.user!.userId}`);
      res.status(201).json({ success: true, data: sanitizeFirmwareImage(firmware) });
    } catch (err: any) {
      if (handleFirmwareUploadError(err, res)) return;
      throw err;
    }
  }),
);

// ============================================================================
// List firmware
// ============================================================================

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Firmware'],
    summary: 'List firmware images',
    security: 'bearer',
    query: firmwareListQuerySchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const targetType = req.query.target_type as string | undefined;
    const validTarget = targetType && VALID_TARGET_TYPES.includes(targetType as FirmwareTargetType) ? targetType as FirmwareTargetType : undefined;
    const firmware = await FirmwareService.listFirmware(validTarget);
    res.json({ success: true, data: firmware.map(sanitizeFirmwareImage) });
  }),
);

// ============================================================================
// Get push status for a gateway (BEFORE /:id to avoid route conflict)
// ============================================================================

registerGet(
  router,
  '/push-status/:gatewayId',
  {
    openApiPath: `${MOUNT}/push-status/{gatewayId}`,
    tags: ['Firmware'],
    summary: 'Get firmware push status for gateway',
    security: 'bearer',
    params: firmwareGatewayIdParamSchema,
    query: firmwarePushStatusQuerySchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = await assertFacilityAccess(req, res, req.params.gatewayId);
    if (!facilityId) return;

    const targetType = req.query.target_type as string | undefined;
    const validTarget = targetType && VALID_TARGET_TYPES.includes(targetType as FirmwareTargetType) ? targetType as FirmwareTargetType : undefined;
    const includeEvents = req.query.include_events !== 'false';
    const push = await FirmwareService.getPushStatus(req.params.gatewayId, validTarget);

    if (!push || !includeEvents) {
      res.json({ success: true, data: push });
      return;
    }

    const [recentEvents, deviceStatuses] = await Promise.all([
      pushEventModel.findByPushId(push.id, 20),
      pushEventModel.getDeviceStatuses(push.id),
    ]);

    res.json({
      success: true,
      data: {
        ...push,
        recent_events: recentEvents,
        device_statuses: deviceStatuses,
      },
    });
  }),
);

// ============================================================================
// Get push history for a gateway (BEFORE /:id to avoid route conflict)
// ============================================================================

registerGet(
  router,
  '/push-history/:gatewayId',
  {
    openApiPath: `${MOUNT}/push-history/{gatewayId}`,
    tags: ['Firmware'],
    summary: 'Get firmware push history for gateway',
    security: 'bearer',
    params: firmwareGatewayIdParamSchema,
    query: firmwarePushHistoryQuerySchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = await assertFacilityAccess(req, res, req.params.gatewayId);
    if (!facilityId) return;

    const targetType = req.query.target_type as string | undefined;
    const validTarget = targetType && VALID_TARGET_TYPES.includes(targetType as FirmwareTargetType) ? targetType as FirmwareTargetType : undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const pushes = await FirmwareService.getPushHistory(req.params.gatewayId, validTarget, limit, offset);
    res.json({ success: true, data: pushes });
  }),
);

// ============================================================================
// Cancel firmware push (BEFORE /:id to avoid route conflict)
// ============================================================================

registerPost(
  router,
  '/push/:pushId/cancel',
  {
    openApiPath: `${MOUNT}/push/{pushId}/cancel`,
    tags: ['Firmware'],
    summary: 'Cancel firmware push',
    security: 'bearer',
    params: firmwarePushIdParamSchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Verify facility access: look up push -> gateway -> facility
    const push = await FirmwareService.getPushById(req.params.pushId);
    if (!push) {
      res.status(404).json({ success: false, message: 'Push not found' });
      return;
    }
    const facilityId = await assertFacilityAccess(req, res, push.gateway_id);
    if (!facilityId) return;

    try {
      await FirmwareService.cancelPush(req.params.pushId);
      res.json({ success: true, message: 'Push cancelled' });
    } catch (err: any) {
      if (err.message?.includes('not found') || err.message?.includes('Cannot cancel')) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      throw err;
    }
  }),
);

// ============================================================================
// Get push event log (paginated)
// ============================================================================

registerGet(
  router,
  '/push/:pushId/events',
  {
    openApiPath: `${MOUNT}/push/{pushId}/events`,
    tags: ['Firmware'],
    summary: 'Get firmware push event log',
    security: 'bearer',
    params: firmwarePushIdParamSchema,
    query: firmwarePushEventsQuerySchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const push = await FirmwareService.getPushById(req.params.pushId);
    if (!push) {
      res.status(404).json({ success: false, message: 'Push not found' });
      return;
    }

    const facilityId = await assertFacilityAccess(req, res, push.gateway_id);
    if (!facilityId) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const eventType = req.query.event_type as string | undefined;
    const validEventTypes = ['progress', 'device_status', 'error', 'info'];

    let events;
    if (eventType && validEventTypes.includes(eventType)) {
      events = await pushEventModel.findByPushIdAndType(req.params.pushId, eventType as FirmwarePushEventType, limit, offset);
    } else {
      events = await pushEventModel.findByPushId(req.params.pushId, limit, offset);
    }

    const total = await pushEventModel.countByPushId(req.params.pushId);
    const deviceStatuses = await pushEventModel.getDeviceStatuses(req.params.pushId);

    res.json({
      success: true,
      data: {
        events,
        device_statuses: deviceStatuses,
        total,
        limit,
        offset,
      },
    });
  }),
);

// ============================================================================
// Get firmware details
// ============================================================================

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Firmware'],
    summary: 'Get firmware details',
    security: 'bearer',
    params: firmwareIdParamSchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const firmware = await FirmwareService.getFirmware(req.params.id);
    if (!firmware) {
      res.status(404).json({ success: false, message: 'Firmware not found' });
      return;
    }
    res.json({ success: true, data: sanitizeFirmwareImage(firmware) });
  }),
);

// ============================================================================
// Delete firmware (soft delete, DEV_ADMIN only)
// ============================================================================

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Firmware'],
    summary: 'Deactivate firmware image',
    security: 'bearer',
    params: firmwareIdParamSchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireDevAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const deleted = await FirmwareService.deleteFirmware(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Firmware not found' });
      return;
    }
    res.json({ success: true, message: 'Firmware deactivated' });
  }),
);

// ============================================================================
// Initiate firmware push to gateway
// ============================================================================

registerPost(
  router,
  '/:id/push/:gatewayId',
  {
    openApiPath: `${MOUNT}/{id}/push/{gatewayId}`,
    tags: ['Firmware'],
    summary: 'Initiate firmware push to gateway',
    security: 'bearer',
    params: firmwarePushGatewayParamSchema,
    responses: {
      200: firmwareResponseSchema,
    },
  },
  authenticateToken,
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id: firmwareId, gatewayId } = req.params;

    // Verify facility access and resolve facility_id
    const facilityId = await assertFacilityAccess(req, res, gatewayId);
    if (!facilityId) return;

    try {
      const push = await FirmwareService.initiatePush(
        firmwareId,
        gatewayId,
        facilityId,
        req.user!.userId,
      );
      logger.info(`Firmware push initiated pushId=${push.id} firmware=${firmwareId} gateway=${gatewayId}`);
      res.json({ success: true, data: push });
    } catch (err: any) {
      if (err.message?.includes('not found') || err.message?.includes('inactive') || err.message?.includes('already has') || err.message?.includes('offline')) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      throw err;
    }
  }),
);

export { router as firmwareRouter };
