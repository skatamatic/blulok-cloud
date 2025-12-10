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
import { DeviceSyncService, GatewayDeviceData, DeviceInventoryItem, DeviceStateUpdate } from '@/services/device-sync.service';
import { GatewayModel } from '@/models/gateway.model';
import { logger } from '@/utils/logger';

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
  devices: Joi.array().items(
    Joi.object({
      // Core identifiers – at least one of these is REQUIRED for proper mapping
      serial: Joi.string().optional(),
      id: Joi.string().optional(),
      lockId: Joi.string().optional(),

      // Status and telemetry fields we actively use
      firmwareVersion: Joi.string().optional(),
      online: Joi.boolean().optional(),
      locked: Joi.boolean().optional(),
      batteryLevel: Joi.number().optional(),
      lastSeen: Joi.string().optional(),

      // Additional optional telemetry from gateway
      lockNumber: Joi.number().optional(),
      batteryUnit: Joi.string().optional(),
      signalStrength: Joi.number().optional(),
      temperatureValue: Joi.number().optional(),
      temperatureUnit: Joi.string().optional(),
    })
      // Enforce that at least one identifier is present; otherwise reject the device payload
      .or('serial', 'id', 'lockId')
      .unknown(true) // Allow extra fields; we will ignore anything we don't need
  ).required()
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
  const rawDevices = value.devices as any[];

  // Normalize incoming gateway device payloads into our internal GatewayDeviceData shape.
  // - Accept both camelCase and snake_case for some fields (e.g. lockId / lock_id)
  // - Map temperatureValue -> temperature
  // - Preserve extra fields via spread so they are available in device_settings.gatewayData
  const devices: GatewayDeviceData[] = rawDevices.map((d: any) => {
    const normalized: GatewayDeviceData = {
      ...d,
      lockId: d.lockId ?? d.lock_id,
      // Prefer explicit temperature field if present, otherwise fall back to temperatureValue
      temperature: d.temperature ?? d.temperatureValue,
    };

    // Normalize lastSeen to Date when provided as string; otherwise let downstream logic handle defaults
    if (typeof d.lastSeen === 'string') {
      normalized.lastSeen = new Date(d.lastSeen);
    }

    return normalized;
  });

  await DeviceSyncService.getInstance().syncGatewayDevices(gateway.id, devices);
  await DeviceSyncService.getInstance().updateDeviceStatuses(gateway.id, devices);

  // Log deprecation warning
  logger.warn(`[DEPRECATED] POST /device-sync called by facility ${facilityId} - use /devices/inventory and /devices/state instead`);

  res.setHeader('X-Deprecated', 'Use /devices/inventory and /devices/state');
  res.json({
    success: true,
    message: 'Device sync applied (deprecated - use /devices/inventory and /devices/state)',
    data: {
      gateway_id: gateway.id,
      facility_id: facilityId,
      received: devices.length
    }
  });
}));

// ============================================================================
// NEW ENDPOINTS: Split inventory and state management
// ============================================================================

// POST /api/v1/internal/gateway/devices/inventory
// Sync device inventory - add new devices, remove missing ones
const inventorySyncSchema = Joi.object({
  facility_id: Joi.string().optional(),
  devices: Joi.array().items(
    Joi.object({
      lock_id: Joi.string().required(),
      lock_number: Joi.number().optional(),
      firmware_version: Joi.string().optional(),
    })
  ).required()
});

router.post('/devices/inventory', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = inventorySyncSchema.validate(req.body);
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

  // Perform inventory sync
  const devices: DeviceInventoryItem[] = value.devices;
  const result = await DeviceSyncService.getInstance().syncDeviceInventory(gateway.id, devices);

  res.json({
    success: true,
    message: 'Inventory sync completed',
    data: {
      gateway_id: gateway.id,
      ...result
    }
  });
}));

// POST /api/v1/internal/gateway/devices/state
// Update device state with partial data
const stateUpdateSchema = Joi.object({
  facility_id: Joi.string().optional(),
  updates: Joi.array().items(
    Joi.object({
      lock_id: Joi.string().required(),
      lock_state: Joi.string().valid('LOCKED', 'UNLOCKED', 'LOCKING', 'UNLOCKING', 'ERROR', 'UNKNOWN').optional(),
      battery_level: Joi.number().min(0).max(100).optional(),
      online: Joi.boolean().optional(),
      signal_strength: Joi.number().optional(),
      temperature: Joi.number().optional(),
      firmware_version: Joi.string().optional(),
      last_seen: Joi.string().isoDate().optional(),
      error_code: Joi.string().allow(null, '').optional(),
      error_message: Joi.string().allow(null, '').optional(),
      source: Joi.string().valid('GATEWAY', 'USER', 'CLOUD').optional(),
    })
  ).required()
});

router.post('/devices/state', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = stateUpdateSchema.validate(req.body);
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

  // Perform state update
  const updates: DeviceStateUpdate[] = value.updates;
  const result = await DeviceSyncService.getInstance().updateDeviceStates(gateway.id, updates);

  res.json({
    success: true,
    message: 'State updates applied',
    data: result
  });
}));

export { router as internalGatewayRouter };


