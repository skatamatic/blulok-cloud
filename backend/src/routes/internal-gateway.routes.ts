/**
 * Internal Gateway Routes (Facility Admin only)
 *
 * - GET /time-sync: return signed Secure Time Sync command packet for broadcast
 * - POST /request-time-sync: return signed time sync packet for a specific lock (startup)
 * - POST /fallback-pass: verify device-signed fallback JWT and issue Route Pass
 *
 * Notes:
 * - Gateways authenticate using facility-scoped Facility Admin JWTs.
 * - Locks reject time sync packets with ts older than their last seen value.
 */
import { Router, Request, Response, RequestHandler, NextFunction } from 'express';
import Joi from 'joi';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { TimeSyncService } from '@/services/time-sync.service';
import { FallbackService } from '@/services/fallback.service';
import { DeviceSyncService } from '@/services/device-sync.service';
import { GatewayModel } from '@/models/gateway.model';

const router = Router();

const requireFacilityAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const role = req.user?.role;
  if (role !== UserRole.FACILITY_ADMIN && role !== UserRole.ADMIN && role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Facility Admin role required' });
    return;
  }
  next();
}

// GET /api/v1/internal/gateway/time-sync
router.get('/time-sync', authenticateToken, requireFacilityAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pkt = await TimeSyncService.buildSecureTimeSync();
  res.json({ success: true, ...pkt });
}));

// POST /api/v1/internal/gateway/request-time-sync
const startupSchema = Joi.object({ lock_id: Joi.string().required() });
router.post('/request-time-sync', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error } = startupSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  const pkt = await TimeSyncService.buildSecureTimeSync();
  res.json({ success: true, ...pkt });
}));

// POST /api/v1/internal/gateway/fallback-pass
const fallbackSchema = Joi.object({ fallbackJwt: Joi.string().required() });
router.post('/fallback-pass', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = fallbackSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  const routePass = await new FallbackService().processFallbackJwt(value.fallbackJwt);
  res.json({ success: true, routePass });
}));

// POST /api/v1/internal/gateway/device-sync
// Simulate a gateway device inventory sync (used by inbound WS test app)
const deviceSyncSchema = Joi.object({
  // Optional facility_id to support direct HTTP testing; for WS proxy the X-Gateway-Facility-Id header will be present
  facility_id: Joi.string().optional(),
  devices: Joi.array().items(Joi.object({
    serial: Joi.string().optional(),
    id: Joi.string().optional(),
    lockId: Joi.string().optional(),
    firmwareVersion: Joi.string().optional(),
    online: Joi.boolean().optional(),
    locked: Joi.boolean().optional(),
    batteryLevel: Joi.number().optional(),
    lastSeen: Joi.string().optional()
  })).required()
});

router.post('/device-sync', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = deviceSyncSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  // Resolve facility and gateway
  const facilityIdHeader = String(req.headers['x-gateway-facility-id'] || '') || undefined;
  const facilityId = value.facility_id || facilityIdHeader;
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'Missing facility_id (body or X-Gateway-Facility-Id header)' });
    return;
  }

  const gatewayModel = new GatewayModel();
  const gateway = await gatewayModel.findByFacilityId(facilityId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found for facility' });
    return;
  }

  // Perform sync
  const devices = value.devices as any[];
  await DeviceSyncService.getInstance().syncGatewayDevices(gateway.id, devices);
  await DeviceSyncService.getInstance().updateDeviceStatuses(gateway.id, devices);

  res.json({
    success: true,
    message: 'Device sync applied',
    data: {
      gateway_id: gateway.id,
      facility_id: facilityId,
      received: devices.length
    }
  });
}));

export { router as internalGatewayRouter };


