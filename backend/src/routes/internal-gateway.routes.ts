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
import {
  DeviceSyncService,
  GatewayDeviceData,
  DeviceInventoryItem,
  DeviceStateUpdate,
  AccessDeviceInventoryItem,
  AccessDeviceStateUpdate,
  type InventorySyncResult,
} from '@/services/device-sync.service';
import { GatewayDeviceSyncLogService } from '@/services/gateway-device-sync-log.service';
import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';
import { normalizeAddLogBody } from '@/utils/gateway-telemetry-log-ingest.utils';
import { partitionInventoryByKind, partitionStateUpdatesByKind } from '@/utils/gateway-sync.utils';
import { AccessCodeService } from '@/services/access-code.service';
import { GatewayModel } from '@/models/gateway.model';
import { AuthService } from '@/services/auth.service';
import { logger } from '@/utils/logger';
import { AccessEventIngestionService } from '@/services/access/access-event-ingestion.service';
import {
  ACCESS_EVENT_ACTIONS,
  ACCESS_EVENT_ACTOR_ROLES,
  ACCESS_EVENT_DENIAL_REASONS,
  ACCESS_EVENT_METHODS,
  AccessEventPayload,
} from '@/services/access/access-event.types';

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
      serial: Joi.string().trim().min(1).optional(),
      id: Joi.string().trim().min(1).optional(),
      lockId: Joi.string().trim().min(1).optional(),

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

const accessEventSchema = Joi.object({
  event_id: Joi.string().required(),
  correlation_id: Joi.string().optional(),
  occurred_at: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).required(),
  facility_id: Joi.string().optional(),
  unit_id: Joi.string().optional(),
  device_id: Joi.string().required(),
  gateway_id: Joi.string().optional(),
  action: Joi.string().valid(...ACCESS_EVENT_ACTIONS).required(),
  method: Joi.string().valid(...ACCESS_EVENT_METHODS).required(),
  success: Joi.boolean().required(),
  denial_reason: Joi.string().valid(...ACCESS_EVENT_DENIAL_REASONS).optional(),
  reason_message: Joi.string().max(500).optional(),
  actor: Joi.object({
    user_id: Joi.string().optional(),
    role: Joi.string().valid(...ACCESS_EVENT_ACTOR_ROLES).required(),
    name: Joi.string().max(255).optional(),
    app_device_id: Joi.string().optional(),
  }).optional(),
  keypad: Joi.object({
    entered_code: Joi.string().max(64).optional(),
    code_id: Joi.string().optional(),
    code_label: Joi.string().max(255).optional(),
    schedule_id: Joi.string().optional(),
    schedule_name: Joi.string().max(255).optional(),
    zone_id: Joi.string().optional(),
    zone_name: Joi.string().max(255).optional(),
  }).optional(),
  route_pass: Joi.object({
    route_pass_id: Joi.string().optional(),
    issuance_id: Joi.string().optional(),
    nonce: Joi.string().optional(),
  }).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).custom((value, helpers) => {
  if (!value.success && !value.denial_reason) {
    return helpers.error('any.custom', { message: 'denial_reason is required when success is false' });
  }
  return value;
});

const accessEventsSchema = Joi.object({
  tid: tidField,
  facility_id: Joi.string().optional(),
  events: Joi.array().items(accessEventSchema).min(1).required(),
});

const addLogSchema = Joi.alternatives().try(
  Joi.object({
    facility_id: Joi.string().uuid().optional(),
    tid: tidField,
    message: Joi.string().required(),
  }),
  Joi.object({
    facility_id: Joi.string().uuid().optional(),
    tid: tidField,
    messages: Joi.array().items(Joi.string()).min(1).max(GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH).required(),
  }),
);

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
const lockInventoryFields = {
  lock_id: Joi.string().trim().min(1).required(),
  lock_number: Joi.number().optional(),
  state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
  lock_state: Joi.string().valid('LOCKED', 'UNLOCKED', 'LOCKING', 'UNLOCKING', 'ERROR', 'UNKNOWN').optional(),
  locked: Joi.boolean().optional(),
  battery_level: Joi.number().optional(),
  battery_unit: Joi.string().optional(),
  online: Joi.boolean().optional(),
  signal_strength: Joi.number().optional(),
  temperature_value: Joi.number().optional(),
  temperature_unit: Joi.string().optional(),
  firmware_version: Joi.string().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const accessInventoryFields = {
  kind: Joi.string().valid('access_control').required(),
  access_id: Joi.string().trim().min(1).required(),
  relay_channel: Joi.number().integer().min(1).max(8).required(),
  device_type: Joi.string().valid('gate', 'door', 'elevator').optional(),
  name: Joi.string().trim().max(255).optional(),
  location_description: Joi.string().trim().max(255).optional(),
  online: Joi.boolean().optional(),
  locked: Joi.boolean().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const lockInventoryItemSchema = Joi.object({
  kind: Joi.string().valid('lock').optional(),
  ...lockInventoryFields,
});

const accessInventoryItemSchema = Joi.object(accessInventoryFields);

const inventorySyncSchema = Joi.object({
  tid: tidField,
  facility_id: Joi.string().optional(),
  devices: Joi.array()
    .items(Joi.alternatives().try(accessInventoryItemSchema, lockInventoryItemSchema))
    .required(),
});

const lockStateFields = {
  lock_id: Joi.string().trim().min(1).required(),
  lock_number: Joi.number().optional(),
  serial: Joi.string().trim().min(1).optional(),
  state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
  lock_state: Joi.string().valid('LOCKED', 'UNLOCKED', 'LOCKING', 'UNLOCKING', 'ERROR', 'UNKNOWN').optional(),
  locked: Joi.boolean().optional(),
  battery_level: Joi.number().optional(),
  battery_unit: Joi.string().optional(),
  online: Joi.boolean().optional(),
  signal_strength: Joi.number().optional(),
  temperature: Joi.number().optional(),
  temperature_value: Joi.number().optional(),
  temperature_unit: Joi.string().optional(),
  firmware_version: Joi.string().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
  error_code: Joi.string().allow(null, '').optional(),
  error_message: Joi.string().allow(null, '').optional(),
  source: Joi.string().valid('GATEWAY', 'USER', 'CLOUD').optional(),
};

const accessStateFields = {
  kind: Joi.string().valid('access_control').required(),
  access_id: Joi.string().trim().min(1).required(),
  relay_channel: Joi.number().integer().min(1).max(8).required(),
  online: Joi.boolean().optional(),
  locked: Joi.boolean().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const lockStateUpdateSchema = Joi.object({
  kind: Joi.string().valid('lock').optional(),
  ...lockStateFields,
});

const accessStateUpdateSchema = Joi.object(accessStateFields);

const stateUpdateSchema = Joi.object({
  tid: tidField,
  facility_id: Joi.string().optional(),
  updates: Joi.array()
    .items(Joi.alternatives().try(accessStateUpdateSchema, lockStateUpdateSchema))
    .required(),
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

  // Perform inventory sync (locks + optional access control)
  let lockDevices: DeviceInventoryItem[];
  let accessDevices: AccessDeviceInventoryItem[];
  try {
    const partitioned = partitionInventoryByKind(value.devices as Record<string, unknown>[]);
    lockDevices = partitioned.locks as unknown as DeviceInventoryItem[];
    accessDevices = partitioned.accessControl as unknown as AccessDeviceInventoryItem[];
  } catch (partitionError: any) {
    res.status(400).json({ success: false, message: partitionError.message });
    return;
  }

  const syncService = DeviceSyncService.getInstance();
  const [lockResult, accessResult] = await Promise.all([
    lockDevices.length > 0
      ? syncService.syncDeviceInventory(gateway.id, lockDevices)
      : Promise.resolve(null),
    accessDevices.length > 0
      ? syncService.syncAccessDeviceInventory(gateway.id, facilityId, accessDevices)
      : Promise.resolve(null),
  ]);

  const result = lockResult ?? {
    added: 0,
    removed: 0,
    unchanged: 0,
    errors: [] as string[],
  };

  const responseData: Record<string, unknown> = {
    gateway_id: gateway.id,
    ...result,
  };

  if (accessResult) {
    responseData.access_control = accessResult;
  }

  try {
    await GatewayDeviceSyncLogService.getInstance().recordInventorySync({
      gatewayId: gateway.id,
      facilityId,
      source: 'gateway_ws',
      lockResult,
      accessResult,
    });
  } catch (logError) {
    logger.warn('[DEVICE-SYNC] Failed to persist inventory sync log', { logError });
  }

  const summarize = (result: InventorySyncResult | null) =>
    result
      ? {
          added: result.added,
          removed: result.removed,
          unchanged: result.unchanged,
          skipped_manual: result.skipped_manual,
          errors: result.errors,
        }
      : null;

  GatewayTelemetryLogService.getInstance().recordSystemEventSafe({
    event: 'device_inventory_sync_completed',
    message: 'Device inventory sync completed (cloud system)',
    facility_id: facilityId,
    gateway_id: gateway.id,
    inventory_summary: {
      locks: summarize(lockResult),
      access_control: summarize(accessResult),
    },
  });

  res.json({
    success: true,
    message: 'Inventory sync completed',
    data: responseData,
  });
}));

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

  let lockUpdates: DeviceStateUpdate[];
  let accessUpdates: AccessDeviceStateUpdate[];
  try {
    const partitioned = partitionStateUpdatesByKind(value.updates as Record<string, unknown>[]);
    lockUpdates = partitioned.locks as unknown as DeviceStateUpdate[];
    accessUpdates = partitioned.accessControl as unknown as AccessDeviceStateUpdate[];
  } catch (partitionError: any) {
    res.status(400).json({ success: false, message: partitionError.message });
    return;
  }

  const syncService = DeviceSyncService.getInstance();
  const [lockResult, accessResult] = await Promise.all([
    lockUpdates.length > 0
      ? syncService.updateDeviceStates(gateway.id, lockUpdates)
      : Promise.resolve(null),
    accessUpdates.length > 0
      ? syncService.updateAccessDeviceStates(gateway.id, accessUpdates)
      : Promise.resolve(null),
  ]);

  const result = lockResult ?? {
    updated: 0,
    not_found: [] as string[],
    errors: [] as string[],
  };

  const responseData: Record<string, unknown> = {
    gateway_id: gateway.id,
    ...result,
  };

  if (accessResult) {
    responseData.access_control = accessResult;
  }

  res.json({
    success: true,
    message: 'State updates applied',
    data: responseData,
  });
}));

router.post('/access-events', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = accessEventsSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) {
    return;
  }

  const ingestionService = new AccessEventIngestionService();
  const events = (value.events as AccessEventPayload[]).map((event) => ({
    ...event,
    facility_id: event.facility_id || facilityId,
  }));

  const created = await ingestionService.ingestMany(events, {
    facilityId,
    source: 'gateway_internal_api',
  });

  res.json({
    success: true,
    data: {
      facility_id: facilityId,
      ingested: created.length,
      activity_ids: created.map((entry) => entry.id),
    },
  });
}));

router.post('/add_log', authenticateToken, requireFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const body = normalizeAddLogBody(req.body);
  if (!body) {
    res.status(400).json({ success: false, message: 'Invalid add_log body' });
    return;
  }

  const { error, value } = addLogSchema.validate(body);
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) {
    return;
  }

  const gatewayModel = new GatewayModel();
  const gateway = await gatewayModel.findByFacilityId(facilityId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found for facility' });
    return;
  }

  const rawLines: string[] = value.messages
    ? (value.messages as string[])
    : [String(value.message)];

  if (rawLines.length > GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH) {
    res.status(400).json({
      success: false,
      message: `At most ${GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH} log lines per request`,
    });
    return;
  }

  const ingested = await GatewayTelemetryLogService.getInstance().ingest(
    facilityId,
    gateway.id,
    rawLines,
  );

  const responseData: Record<string, unknown> = {
    ingested: ingested.length,
    ids: ingested.map((row) => row.id),
    gateway_id: gateway.id,
    facility_id: facilityId,
  };
  if (value.tid !== undefined) {
    responseData.tid = value.tid;
  }

  res.json({
    success: true,
    data: responseData,
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


