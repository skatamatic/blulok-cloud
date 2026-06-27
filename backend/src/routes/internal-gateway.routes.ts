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
import { Router, Response, RequestHandler, NextFunction } from 'express';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { TimeSyncService } from '@/services/time-sync.service';
import { FallbackService } from '@/services/fallback.service';
import {
  DeviceSyncService,
  DeviceInventoryItem,
  DeviceStateUpdate,
  AccessDeviceInventoryItem,
  AccessDeviceStateUpdate,
  type InventorySyncResult,
} from '@/services/device-sync.service';
import type { NetworkInfraStateUpdate } from '@/utils/gateway-sync.utils';
import { GatewayDeviceSyncLogService } from '@/services/gateway-device-sync-log.service';
import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';
import { normalizeAddLogBody } from '@/utils/gateway-telemetry-log-ingest.utils';
import { partitionInventoryItems, partitionStateUpdatesByKind } from '@/utils/gateway-sync.utils';
import type { NetworkInfraInventoryItem } from '@/utils/gateway-sync.utils';
import { AccessCodeService } from '@/services/access-code.service';
import { GatewayModel } from '@/models/gateway.model';
import { AuthService } from '@/services/auth.service';
import { logger } from '@/utils/logger';
import { AccessEventIngestionService } from '@/services/access/access-event-ingestion.service';
import { AccessEventPayload } from '@/services/access/access-event.types';
import { registerGet, registerPost } from '@/openapi/register-route';
import {
  gatewayStartupBodySchema,
  gatewayFallbackPassBodySchema,
  gatewayAccessEventsBodySchema,
  gatewayAddLogBodySchema,
  gatewayInventorySyncBodySchema,
  gatewayStateUpdateBodySchema,
  gatewayAccessCodesQuerySchema,
} from '@/schemas/internal-gateway.schemas';

const router = Router();
const MOUNT = '/api/v1/internal/gateway';

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

registerGet(
  router,
  '/time-sync',
  {
    openApiPath: `${MOUNT}/time-sync`,
    tags: ['GatewayInternal'],
    summary: 'Return signed Secure Time Sync command packet for broadcast',
    security: 'bearer',
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pkt = await TimeSyncService.buildSecureTimeSync();
  res.json({ success: true, ...pkt });
  }),
);

registerPost(
  router,
  '/request-time-sync',
  {
    openApiPath: `${MOUNT}/request-time-sync`,
    tags: ['GatewayInternal'],
    summary: 'Return signed time sync packet for a specific lock',
    security: 'bearer',
    body: gatewayStartupBodySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;
  const pkt = await TimeSyncService.buildSecureTimeSync(undefined, value.lock_id);
  res.json({ success: true, ...pkt });
  }),
);

registerPost(
  router,
  '/fallback-pass',
  {
    openApiPath: `${MOUNT}/fallback-pass`,
    tags: ['GatewayInternal'],
    summary: 'Verify device-signed fallback JWT and issue Route Pass',
    security: 'bearer',
    body: gatewayFallbackPassBodySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;
  const routePass = await new FallbackService().processFallbackJwt(value.fallbackJwt);
  res.json({ success: true, routePass });
  }),
);

registerPost(
  router,
  '/devices/inventory',
  {
    openApiPath: `${MOUNT}/devices/inventory`,
    tags: ['GatewayInternal'],
    summary: 'Sync device inventory from gateway',
    security: 'bearer',
    body: gatewayInventorySyncBodySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;

  const facilityId = await resolveScopedFacilityId(req, res, value.facility_id);
  if (!facilityId) return;

  const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
  if (await GatewayRecoveryService.isBlockingActiveForFacility(facilityId)) {
    res.status(409).json({
      success: false,
      code: 'recovery_in_progress',
      message: 'Gateway recovery in progress — inventory sync blocked until recovery completes or is bypassed',
    });
    return;
  }

  const gatewayModel = new GatewayModel();
  const gateway = await gatewayModel.findByFacilityId(facilityId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found for facility' });
    return;
  }

  // Perform inventory sync (locks + optional access control + network infra)
  let lockDevices: DeviceInventoryItem[];
  let accessDevices: AccessDeviceInventoryItem[];
  let networkInfraDevices: NetworkInfraInventoryItem[];
  let gatewayUpdates: Record<string, unknown>[];
  try {
    const partitioned = partitionInventoryItems(value.devices as Record<string, unknown>[]);
    lockDevices = partitioned.locks as unknown as DeviceInventoryItem[];
    accessDevices = partitioned.accessControl as unknown as AccessDeviceInventoryItem[];
    networkInfraDevices = partitioned.networkInfra as unknown as NetworkInfraInventoryItem[];
    gatewayUpdates = partitioned.gatewayUpdates;
  } catch (partitionError: any) {
    res.status(400).json({ success: false, message: partitionError.message });
    return;
  }

  const syncService = DeviceSyncService.getInstance();
  const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
  const infraSyncService = GatewayInventoryDeviceSyncService.getInstance();

  const [lockResult, accessResult, networkInfraResult] = await Promise.all([
    syncService.syncDeviceInventory(gateway.id, lockDevices),
    syncService.syncAccessDeviceInventory(gateway.id, facilityId, accessDevices),
    infraSyncService.syncNetworkInfraInventory(gateway.id, networkInfraDevices),
  ]);

  for (const gatewayUpdate of gatewayUpdates) {
    try {
      await infraSyncService.applyGatewayInventoryUpdate(gateway.id, gatewayUpdate);
    } catch (gatewayUpdateError: any) {
      logger.warn('[DEVICE-SYNC] Failed to apply gateway inventory update', {
        gatewayId: gateway.id,
        error: gatewayUpdateError?.message || String(gatewayUpdateError),
      });
    }
  }

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

  if (networkInfraResult) {
    responseData.network_infra = networkInfraResult;
  }

  try {
    await GatewayDeviceSyncLogService.getInstance().recordInventorySync({
      gatewayId: gateway.id,
      facilityId,
      source: 'gateway_ws',
      lockResult,
      accessResult,
      networkInfraResult,
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
          updated: result.updated,
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
      network_infra: summarize(networkInfraResult),
    },
  });

  res.json({
    success: true,
    message: 'Inventory sync completed',
    data: responseData,
  });
  }),
);

registerPost(
  router,
  '/devices/state',
  {
    openApiPath: `${MOUNT}/devices/state`,
    tags: ['GatewayInternal'],
    summary: 'Apply device state updates from gateway',
    security: 'bearer',
    body: gatewayStateUpdateBodySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;

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
  let networkInfraUpdates: NetworkInfraStateUpdate[];
  try {
    const partitioned = partitionStateUpdatesByKind(value.updates as Record<string, unknown>[]);
    lockUpdates = partitioned.locks as unknown as DeviceStateUpdate[];
    accessUpdates = partitioned.accessControl as unknown as AccessDeviceStateUpdate[];
    networkInfraUpdates = partitioned.networkInfra as unknown as NetworkInfraStateUpdate[];
  } catch (partitionError: any) {
    res.status(400).json({ success: false, message: partitionError.message });
    return;
  }

  const syncService = DeviceSyncService.getInstance();
  const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
  const infraSyncService = GatewayInventoryDeviceSyncService.getInstance();

  const [lockResult, accessResult, networkInfraResult] = await Promise.all([
    lockUpdates.length > 0
      ? syncService.updateDeviceStates(gateway.id, lockUpdates)
      : Promise.resolve(null),
    accessUpdates.length > 0
      ? syncService.updateAccessDeviceStates(gateway.id, accessUpdates)
      : Promise.resolve(null),
    networkInfraUpdates.length > 0
      ? infraSyncService.updateNetworkInfraDeviceStates(gateway.id, networkInfraUpdates)
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

  if (networkInfraResult) {
    responseData.network_infra = networkInfraResult;
  }

  res.json({
    success: true,
    message: 'State updates applied',
    data: responseData,
  });
  }),
);

registerPost(
  router,
  '/access-events',
  {
    openApiPath: `${MOUNT}/access-events`,
    tags: ['GatewayInternal'],
    summary: 'Ingest access events from gateway',
    security: 'bearer',
    body: gatewayAccessEventsBodySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body;

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
  }),
);

registerPost(
  router,
  '/add_log',
  {
    openApiPath: `${MOUNT}/add_log`,
    tags: ['GatewayInternal'],
    summary: 'Ingest gateway telemetry log lines',
    security: 'bearer',
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const body = normalizeAddLogBody(req.body);
  if (!body) {
    res.status(400).json({ success: false, message: 'Invalid add_log body' });
    return;
  }

  const { error, value } = gatewayAddLogBodySchema.validate(body);
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
  }),
);

registerGet(
  router,
  '/access-codes',
  {
    openApiPath: `${MOUNT}/access-codes`,
    tags: ['GatewayInternal'],
    summary: 'Poll active access codes for facility',
    security: 'bearer',
    query: gatewayAccessCodesQuerySchema,
  },
  authenticateToken,
  requireFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        access_id: entry.access_id,
        relay_channel: entry.relay_channel,
        code: entry.code,
        valid_until: entry.valid_until instanceof Date ? entry.valid_until.toISOString() : entry.valid_until,
      })),
    },
  });
  }),
);

export { router as internalGatewayRouter };


