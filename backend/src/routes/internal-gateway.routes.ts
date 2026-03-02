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
import { AccessCodeService } from '@/services/access-code.service';
import { GatewayModel } from '@/models/gateway.model';
import { AuthService } from '@/services/auth.service';
import { logger } from '@/utils/logger';

const router = Router();

// Gateway proxy injects a `tid` (transaction ID) for request/response correlation
const tidField = Joi.alternatives().try(Joi.number(), Joi.string()).optional();

const requireFacilityAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const role = req.user?.role;
  if (role !== UserRole.FACILITY_ADMIN && role !== UserRole.ADMIN && role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Facility Admin role required' });
    return;
  }
  next();
}

const assertFacilityAccess = async (req: AuthenticatedRequest, res: Response, facilityId: string): Promise<boolean> => {
  const user = req.user!;
  const hasAccess = await AuthService.canAccessFacility(user.userId, user.role, facilityId);
  if (!hasAccess) {
    res.status(403).json({ success: false, message: 'Access denied to this facility' });
    return false;
  }
  return true;
};

const resolveScopedFacilityId = async (
  req: AuthenticatedRequest,
  res: Response,
  requestedFacilityId: string | undefined,
): Promise<string | null> => {
  const user = req.user!;
  const headerFacilityId = String(req.headers['x-gateway-facility-id'] || '') || undefined;
  const bodyOrQueryFacilityId = requestedFacilityId || undefined;

  if (user.role === UserRole.FACILITY_ADMIN) {
    if (headerFacilityId && bodyOrQueryFacilityId && bodyOrQueryFacilityId !== headerFacilityId) {
      res.status(403).json({ success: false, message: 'facility_id cannot override gateway facility scope' });
      return null;
    }
  }

  const facilityId = String(bodyOrQueryFacilityId || headerFacilityId || '');
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'Missing facility_id (body/query or X-Gateway-Facility-Id header)' });
    return null;
  }

  if (!await assertFacilityAccess(req, res, facilityId)) {
    return null;
  }

  return facilityId;
};

// GET /api/v1/internal/gateway/time-sync
router.get('/time-sync', authenticateToken, requireFacilityAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pkt = await TimeSyncService.buildSecureTimeSync();
  res.json({ success: true, ...pkt });
}));

// POST /api/v1/internal/gateway/request-time-sync
const startupSchema = Joi.object({ lock_id: Joi.string().required(), tid: tidField });
router.post('/request-time-sync', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = startupSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  const pkt = await TimeSyncService.buildSecureTimeSync(undefined, value.lock_id);
  res.json({ success: true, ...pkt });
}));

// POST /api/v1/internal/gateway/fallback-pass
const fallbackSchema = Joi.object({ fallbackJwt: Joi.string().required(), tid: tidField });
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
  tid: tidField,
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

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) return;

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
// Now also supports updating state fields in the same call
const inventorySyncSchema = Joi.object({
  tid: tidField,
  facility_id: Joi.string().optional(),
  devices: Joi.array().items(
    Joi.object({
      lock_id: Joi.string().required(),
      lock_number: Joi.number().optional(),
      // State fields (matching gateway payload format)
      state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
      lock_state: Joi.string().valid('LOCKED', 'UNLOCKED', 'LOCKING', 'UNLOCKING', 'ERROR', 'UNKNOWN').optional(),
      locked: Joi.boolean().optional(),
      battery_level: Joi.number().optional(), // Raw mV, no longer 0-100
      battery_unit: Joi.string().optional(),
      online: Joi.boolean().optional(),
      signal_strength: Joi.number().optional(),
      temperature_value: Joi.number().optional(),
      temperature_unit: Joi.string().optional(),
      firmware_version: Joi.string().optional(),
      last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
    })
  ).required()
});

router.post('/devices/inventory', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = inventorySyncSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) return;

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
// Matches gateway payload format with all state fields
const stateUpdateSchema = Joi.object({
  tid: tidField,
  facility_id: Joi.string().optional(),
  updates: Joi.array().items(
    Joi.object({
      lock_id: Joi.string().required(),
      lock_number: Joi.number().optional(),
      serial: Joi.string().optional(),
      // State fields (matching gateway payload format)
      state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
      lock_state: Joi.string().valid('LOCKED', 'UNLOCKED', 'LOCKING', 'UNLOCKING', 'ERROR', 'UNKNOWN').optional(),
      locked: Joi.boolean().optional(),
      battery_level: Joi.number().optional(), // Raw mV, no longer 0-100
      battery_unit: Joi.string().optional(),
      online: Joi.boolean().optional(),
      signal_strength: Joi.number().optional(),
      temperature: Joi.number().optional(), // Legacy field
      temperature_value: Joi.number().optional(),
      temperature_unit: Joi.string().optional(),
      firmware_version: Joi.string().optional(),
      last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
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

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) return;

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

// GET /api/v1/internal/gateway/access-codes
// Poll active access codes resolved to device/relay mappings for this facility.
router.get('/access-codes', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const facilityIdHeader = String(req.headers['x-gateway-facility-id'] || '') || undefined;
  const requestedFacilityId = req.query.facility_id ? String(req.query.facility_id) : undefined;
  let facilityId = '';

  if (user.role === UserRole.FACILITY_ADMIN) {
    if (facilityIdHeader && requestedFacilityId && requestedFacilityId !== facilityIdHeader) {
      res.status(403).json({ success: false, message: 'facility_id query cannot override gateway facility scope' });
      return;
    }
    facilityId = String(facilityIdHeader || requestedFacilityId || '');
    if (facilityId && !user.facilityIds?.includes(facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
  } else {
    facilityId = String(requestedFacilityId || facilityIdHeader || '');
  }

  if (!facilityId) {
    res.status(400).json({ success: false, message: 'Missing facility_id (query or X-Gateway-Facility-Id header)' });
    return;
  }

  const gatewayModel = new GatewayModel();
  const gateway = await gatewayModel.findByFacilityId(facilityId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found for facility' });
    return;
  }

  const codes = await AccessCodeService.getInstance().getGatewayPollPayload(facilityId);
  res.json({
    success: true,
    data: {
      gateway_id: gateway.id,
      facility_id: facilityId,
      codes: codes.map((entry) => ({
        device_id: entry.device_id,
        relay_channel: entry.relay_channel,
        code: entry.code,
        valid_until: entry.valid_until instanceof Date ? entry.valid_until.toISOString() : entry.valid_until,
      })),
    },
  });
}));

export { router as internalGatewayRouter };


