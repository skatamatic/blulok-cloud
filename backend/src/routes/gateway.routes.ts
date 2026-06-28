/**
 * Gateway Routes
 *
 * Comprehensive gateway management API providing CRUD operations for facility gateways.
 * Supports multiple gateway types (physical, HTTP, simulated) with configuration validation,
 * connection testing, and operational monitoring.
 *
 * Key Features:
 * - Multi-type gateway support (WebSocket, HTTP, simulated)
 * - Gateway configuration management and validation
 * - Connection testing and health monitoring
 * - Facility-scoped gateway operations
 * - Role-based access control for gateway management
 * - Gateway status and telemetry data
 *
 * Gateway Types:
 * - physical: WebSocket-based direct device control
 * - http: REST API-based cloud-managed gateways
 * - simulated: Testing gateways with mock behavior
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full gateway management capabilities
 * - FACILITY_ADMIN: Management of gateways in assigned facilities
 * - TENANT/MAINTENANCE: Read-only access to gateway status
 *
 * Gateway Operations:
 * - Create gateways with type-specific configuration
 * - Update gateway settings and connection parameters
 * - Delete gateways and cleanup associated resources
 * - Test gateway connections and validate configurations
 * - Monitor gateway status and operational health
 * - Retrieve gateway telemetry and performance data
 *
 * Security Considerations:
 * - Facility-scoped gateway access prevents cross-facility operations
 * - Configuration validation prevents misconfigurations
 * - Secure credential handling for gateway authentication
 * - Audit logging for all gateway operations
 * - Permission checks before sensitive operations
 */

import { Router, Response } from 'express';
import { GatewayModel } from '../models/gateway.model';
import { FacilityModel } from '../models/facility.model';
import { authenticateToken, requireAdmin, requireRoles } from '../middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';
import { asyncHandler } from '../middleware/error.middleware';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayDeviceSyncLogService } from '@/services/gateway-device-sync-log.service';
import { GatewayTelemetryLogService } from '@/services/gateway-telemetry-log.service';
import { sanitizePayloadPath } from '@/utils/gateway-telemetry-log.parser';
import { parseQueryDateFrom, parseQueryDateTo } from '@/utils/datetime.utils';
import { parseQueryIntClamped, parseQueryInt, queryString } from '@/utils/query-boolean.util';
import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';
import { InventorySnapshotService } from '@/services/gateway/inventory-snapshot.service';
import {
  registerGet,
  registerPost,
  registerPut,
} from '@/openapi/register-route';
import {
  gatewayFacilityIdParamSchema,
  gatewayIdParamSchema,
  gatewayRecoveryIdParamSchema,
  gatewayResourceIdParamSchema,
  gatewayListQuerySchema,
  gatewayRecoveryInitiateSchema,
  gatewayRecoveryBypassSchema,
  gatewayStatusUpdateSchema,
  gatewayTelemetryLogsQuerySchema,
  gatewaySyncLogsQuerySchema,
  gatewayRecoveryEventsQuerySchema,
  gatewayResponseSchema,
} from '@/schemas/gateway.schemas';

const router = Router();
const MOUNT = '/api/v1/gateways';
const gatewayModel = new GatewayModel();
const facilityModel = new FacilityModel();

/**
 * Validate that a gateway has sufficient configuration for connection testing
 */
function validateGatewayConfigurationForTesting(gateway: any): boolean {
  const { gateway_type, base_url, connection_url } = gateway;

  switch (gateway_type) {
    case 'http':
      // HTTP gateways require at least a base_url
      return !!(base_url && base_url.trim().length > 0);

    case 'physical':
      // Physical gateways require a connection_url (WebSocket endpoint)
      return !!(connection_url && connection_url.trim().length > 0);

    case 'simulated':
      // Simulated gateways always pass validation (they simulate connections)
      return true;

    default:
      return false;
  }
}

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET /api/gateways/status/:facilityId - Inbound WS connection status for a facility
registerGet(
  router,
  '/status/:facilityId',
  {
    openApiPath: `${MOUNT}/status/{facilityId}`,
    tags: ['Gateway'],
    summary: 'Get inbound WebSocket connection status for facility',
    security: 'bearer',
    params: gatewayFacilityIdParamSchema,
    responses: {
      200: gatewayResponseSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const facilityId = String(req.params.facilityId);

  // Facility admins must be scoped to this facility
  if (user.role === UserRole.FACILITY_ADMIN) {
    if (!user.facilityIds?.includes(facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
  }

  const status = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
  res.json({ success: true, facilityId, ...status });
}));

async function assertGatewayFacilityAccess(
  req: AuthenticatedRequest,
  res: Response,
  gatewayId: string,
): Promise<{ gateway: Awaited<ReturnType<GatewayModel['findById']>>; facilityId: string } | null> {
  const gateway = await gatewayModel.findById(gatewayId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found' });
    return null;
  }
  if (req.user?.role === UserRole.FACILITY_ADMIN) {
    const allowed = req.user.facilityIds || [];
    if (!gateway.facility_id || !allowed.includes(gateway.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied to this gateway' });
      return null;
    }
  }
  if (!gateway.facility_id) {
    res.status(409).json({ success: false, message: 'Gateway is not assigned to a facility' });
    return null;
  }
  return { gateway, facilityId: gateway.facility_id };
}

async function assertFacilityAccess(
  req: AuthenticatedRequest,
  res: Response,
  facilityId: string,
): Promise<boolean> {
  if (req.user?.role === UserRole.FACILITY_ADMIN) {
    const allowed = req.user.facilityIds || [];
    if (!allowed.includes(facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return false;
    }
  }
  return true;
}

async function assertRecoveryGatewayAccess(
  req: AuthenticatedRequest,
  res: Response,
  gatewayId: string,
): Promise<{ gateway: NonNullable<Awaited<ReturnType<GatewayModel['findById']>>>; facilityId: string } | null> {
  const gateway = await gatewayModel.findById(gatewayId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found' });
    return null;
  }
  const recovery = await GatewayRecoveryService.getStatusForGateway(gatewayId);
  let facilityId = recovery?.facility_id || gateway.facility_id || undefined;
  if (!facilityId && req.user?.role === UserRole.FACILITY_ADMIN && req.user.facilityIds?.length) {
    facilityId =
      (await GatewayRecoveryService.resolveFacilityAccessForUnboundGateway(
        gatewayId,
        req.user.facilityIds,
      )) ?? undefined;
  }
  if (!facilityId) {
    res.status(409).json({ success: false, message: 'Gateway is not associated with a facility recovery' });
    return null;
  }
  if (!(await assertFacilityAccess(req, res, facilityId))) return null;
  return { gateway, facilityId };
}

// ── Gateway Swap / Recovery ──

// GET /api/gateways/:gatewayId/recovery/status
registerGet(
  router,
  '/:gatewayId/recovery/status',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/status`,
    tags: ['Gateway'],
    summary: 'Get gateway recovery status',
    security: 'bearer',
    params: gatewayIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  const status = await GatewayRecoveryService.getStatusForGateway(gatewayId);
  res.json({ success: true, data: status });
}));

// GET /api/gateways/facility/:facilityId/recovery/candidates
registerGet(
  router,
  '/facility/:facilityId/recovery/candidates',
  {
    openApiPath: `${MOUNT}/facility/{facilityId}/recovery/candidates`,
    tags: ['Gateway'],
    summary: 'List gateway recovery swap candidates',
    security: 'bearer',
    params: gatewayFacilityIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = String(req.params.facilityId);
  if (!(await assertFacilityAccess(req, res, facilityId))) return;

  const candidates = await GatewayRecoveryService.getRecoveryCandidatesPayload(facilityId);
  res.json({ success: true, data: candidates });
}));

// GET /api/gateways/:gatewayId/recovery/inventory-preview
registerGet(
  router,
  '/:gatewayId/recovery/inventory-preview',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/inventory-preview`,
    tags: ['Gateway'],
    summary: 'Preview inventory for gateway recovery',
    security: 'bearer',
    params: gatewayIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  const devices = await InventorySnapshotService.previewForFacility(access.facilityId);
  res.json({ success: true, data: { devices } });
}));

// POST /api/gateways/:gatewayId/recovery/initiate
registerPost(
  router,
  '/:gatewayId/recovery/initiate',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/initiate`,
    tags: ['Gateway'],
    summary: 'Initiate gateway recovery',
    security: 'bearer',
    params: gatewayIdParamSchema,
    body: gatewayRecoveryInitiateSchema,
    responses: {
      200: gatewayResponseSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  try {
    const recovery = await GatewayRecoveryService.initiate(
      gatewayId,
      access.facilityId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: recovery });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to initiate recovery' });
  }
}));

// POST /api/gateways/:gatewayId/recovery/advance
registerPost(
  router,
  '/:gatewayId/recovery/advance',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/advance`,
    tags: ['Gateway'],
    summary: 'Advance gateway recovery',
    security: 'bearer',
    params: gatewayIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  try {
    const recovery = await GatewayRecoveryService.advance(gatewayId, access.facilityId);
    res.json({ success: true, data: recovery });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to advance recovery' });
  }
}));

// POST /api/gateways/:gatewayId/recovery/bypass
registerPost(
  router,
  '/:gatewayId/recovery/bypass',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/bypass`,
    tags: ['Gateway'],
    summary: 'Bypass gateway recovery (admin only)',
    security: 'bearer',
    params: gatewayIdParamSchema,
    body: gatewayRecoveryBypassSchema,
    responses: {
      200: gatewayResponseSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  try {
    const recovery = await GatewayRecoveryService.bypass(
      gatewayId,
      access.facilityId,
      req.user!.userId,
      req.body.confirm === true,
    );
    res.json({ success: true, data: recovery });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to bypass recovery' });
  }
}));

// GET /api/gateways/:gatewayId/recovery/options
registerGet(
  router,
  '/:gatewayId/recovery/options',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/options`,
    tags: ['Gateway'],
    summary: 'Get gateway recovery options',
    security: 'bearer',
    params: gatewayIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  const options = await GatewayRecoveryService.getRecoveryOptions(gatewayId, access.facilityId);
  res.json({ success: true, data: options });
}));

// POST /api/gateways/:gatewayId/recovery/retry
registerPost(
  router,
  '/:gatewayId/recovery/retry',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/retry`,
    tags: ['Gateway'],
    summary: 'Retry gateway recovery',
    security: 'bearer',
    params: gatewayIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  try {
    const recovery = await GatewayRecoveryService.retry(gatewayId, access.facilityId);
    res.json({ success: true, data: recovery });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to retry recovery' });
  }
}));

// GET /api/gateways/:gatewayId/recovery/:recoveryId/events
registerGet(
  router,
  '/:gatewayId/recovery/:recoveryId/events',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/{recoveryId}/events`,
    tags: ['Gateway'],
    summary: 'Get gateway recovery events',
    security: 'bearer',
    params: gatewayRecoveryIdParamSchema,
    query: gatewayRecoveryEventsQuerySchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const recoveryId = String(req.params.recoveryId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  const recovery = await GatewayRecoveryService.getRecoveryById(recoveryId);
  if (!recovery || recovery.id !== recoveryId || recovery.gateway_id !== gatewayId || recovery.facility_id !== access.facilityId) {
    res.status(404).json({ success: false, message: 'Recovery not found' });
    return;
  }

  const limit = parseQueryIntClamped(req.query.limit, 100, 1, 200);
  const events = await GatewayRecoveryService.getRecoveryEvents(recoveryId, limit);
  res.json({ success: true, data: { events } });
}));

// POST /api/gateways/:gatewayId/recovery/:recoveryId/cancel
registerPost(
  router,
  '/:gatewayId/recovery/:recoveryId/cancel',
  {
    openApiPath: `${MOUNT}/{gatewayId}/recovery/{recoveryId}/cancel`,
    tags: ['Gateway'],
    summary: 'Cancel gateway recovery',
    security: 'bearer',
    params: gatewayRecoveryIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.gatewayId);
  const recoveryId = String(req.params.recoveryId);
  const access = await assertRecoveryGatewayAccess(req, res, gatewayId);
  if (!access) return;

  const recovery = await GatewayRecoveryService.getRecoveryById(recoveryId);
  if (!recovery || recovery.id !== recoveryId || recovery.gateway_id !== gatewayId || recovery.facility_id !== access.facilityId) {
    res.status(404).json({ success: false, message: 'Recovery not found' });
    return;
  }

  try {
    await GatewayRecoveryService.cancel(recoveryId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Failed to cancel recovery' });
  }
}));

// POST /api/gateways - Create new gateway
registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Gateway'],
    summary: 'Create gateway',
    security: 'bearer',
    responses: { 201: gatewayResponseSchema },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
 
  const gatewayData = req.body;
  const gateway = await gatewayModel.create(gatewayData);
  
  res.status(201).json({ 
    success: true, 
    gateway 
  });
}));

// GET /api/gateways - Get all gateways
registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Gateway'],
    summary: 'List gateways',
    security: 'bearer',
    query: gatewayListQuerySchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const facilityFilter = queryString(req.query.facility_id);
  
  const gateways = await gatewayModel.findAll();
  
  // Filter by facility access if user is facility-scoped
  let filteredGateways = gateways;
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    // Filter gateways to only those belonging to user's facilities
    filteredGateways = gateways.filter(gateway => 
      !!gateway.facility_id && user.facilityIds!.includes(gateway.facility_id)
    );
  }

  // Optional direct facility filter used by facility-specific UI calls.
  if (facilityFilter) {
    filteredGateways = filteredGateways.filter((gateway) => gateway.facility_id === facilityFilter);
  }
  
  res.json({ 
    success: true, 
    gateways: filteredGateways 
  });
}));

// GET /api/gateways/:id/telemetry-logs — gateway operational log stream (admin / facility admin)
registerGet(
  router,
  '/:id/telemetry-logs',
  {
    openApiPath: `${MOUNT}/{id}/telemetry-logs`,
    tags: ['Gateway'],
    summary: 'Get gateway telemetry logs',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    query: gatewayTelemetryLogsQuerySchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const gatewayId = String(req.params.id);
  const limit = parseQueryIntClamped(req.query.limit, 500, 1, 500);
  const offset = Math.max(parseQueryInt(req.query.offset, 0), 0);

  const gateway = await gatewayModel.findById(gatewayId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found' });
    return;
  }

  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!gateway.facility_id || !user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied. You can only access gateways in your assigned facilities.' });
      return;
    }
  }

  const payloadPath = queryString(req.query.payload_path);
  const payloadValue = queryString(req.query.payload_value);
  if (payloadPath && !sanitizePayloadPath(payloadPath)) {
    res.status(400).json({ success: false, message: 'Invalid payload_path' });
    return;
  }

  const fromRaw = queryString(req.query.from);
  const toRaw = queryString(req.query.to);
  const from = fromRaw ? parseQueryDateFrom(fromRaw) : undefined;
  const to = toRaw ? parseQueryDateTo(toRaw) : undefined;
  if (from && Number.isNaN(from.getTime())) {
    res.status(400).json({ success: false, message: 'Invalid from date' });
    return;
  }
  if (to && Number.isNaN(to.getTime())) {
    res.status(400).json({ success: false, message: 'Invalid to date' });
    return;
  }

  const payloadOp = req.query.payload_op === 'contains' ? 'contains' : 'eq';
  const search = queryString(req.query.search);
  const sourceRaw = queryString(req.query.source)?.trim() ?? '';
  const source =
    sourceRaw === 'gateway_ws' || sourceRaw === 'cloud_system' ? sourceRaw : undefined;
  if (sourceRaw && !source) {
    res.status(400).json({ success: false, message: 'Invalid source filter' });
    return;
  }

  const { logs, total } = await GatewayTelemetryLogService.getInstance().list(
    gatewayId,
    {
      from,
      to,
      search,
      source,
      payload_path: payloadPath,
      payload_value: payloadValue,
      payload_op: payloadOp,
    },
    { limit, offset },
  );

  res.json({
    success: true,
    logs,
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  });
}));

// GET /api/gateways/:id/device-sync-logs — inventory sync audit trail (admin / dev_admin only)
registerGet(
  router,
  '/:id/device-sync-logs',
  {
    openApiPath: `${MOUNT}/{id}/device-sync-logs`,
    tags: ['Gateway'],
    summary: 'Get gateway device sync logs',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    query: gatewaySyncLogsQuerySchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const gatewayId = String(req.params.id);
  const limit = parseQueryIntClamped(req.query.limit, 20, 1, 100);
  const offset = Math.max(parseQueryInt(req.query.offset, 0), 0);

  const gateway = await gatewayModel.findById(gatewayId);
  if (!gateway) {
    res.status(404).json({ success: false, message: 'Gateway not found' });
    return;
  }

  const { logs, total } = await GatewayDeviceSyncLogService.getInstance().listForGateway(gatewayId, {
    limit,
    offset,
  });

  res.json({
    success: true,
    logs,
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  });
}));

// GET /api/gateways/:id - Get specific gateway
registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Gateway'],
    summary: 'Get gateway by ID',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id;
  
  const gateway = await gatewayModel.findById(String(id));
  
  if (!gateway) {
    res.status(404).json({ 
      success: false, 
      message: 'Gateway not found' 
    });
    return;
  }

  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    const boundToAssignedFacility =
      gateway.facility_id != null && user.facilityIds.includes(gateway.facility_id);

    if (boundToAssignedFacility) {
      // allowed
    } else if (gateway.facility_id) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only access gateways in your assigned facilities.',
      });
      return;
    } else {
      const scopedViaRecovery = await GatewayRecoveryService.resolveFacilityAccessForUnboundGateway(
        gateway.id,
        user.facilityIds,
      );
      if (!scopedViaRecovery) {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only access gateways in your assigned facilities.',
        });
        return;
      }
    }
  }

  res.json({ 
    success: true, 
    gateway 
  });
}));

// PUT /api/gateways/:id - Update gateway
registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Gateway'],
    summary: 'Update gateway',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
 
  const gatewayData = req.body;
  const gateway = await gatewayModel.update(String(id), gatewayData);

  if (!gateway) {
    res.status(404).json({
      success: false,
      message: 'Gateway not found'
    });
    return;
  }

  // Reinitialize gateway with updated configuration to ensure cached instance uses new settings
  try {
    const { GatewayService } = await import('../services/gateway/gateway.service');
    const gatewayService = GatewayService.getInstance();
    await gatewayService.reinitializeGateway(gateway);
  } catch (reinitError) {
    console.warn(`Failed to reinitialize gateway ${id} after update:`, reinitError);
    // Don't fail the update if reinitialization fails, just log the warning
  }

  res.json({
    success: true,
    gateway
  });
}));

// PUT /api/gateways/:id/status - Update gateway status
registerPut(
  router,
  '/:id/status',
  {
    openApiPath: `${MOUNT}/{id}/status`,
    tags: ['Gateway'],
    summary: 'Update gateway status',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    body: gatewayStatusUpdateSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id;
  const { status } = req.body as { status: string };
  
  // Check if gateway exists and user has access
  const gateway = await gatewayModel.findById(String(id));
  if (!gateway) {
    res.status(404).json({ 
      success: false, 
      message: 'Gateway not found' 
    });
    return;
  }
  
  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!gateway.facility_id || !user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only update gateways in your assigned facilities.' 
      });
      return;
    }
  }
  
  await gatewayModel.updateStatus(String(id), status as any);
  
  res.json({ 
    success: true, 
    message: 'Gateway status updated successfully' 
  });
}));

// POST /api/gateways/:id/test-connection - Test gateway connection
registerPost(
  router,
  '/:id/test-connection',
  {
    openApiPath: `${MOUNT}/{id}/test-connection`,
    tags: ['Gateway'],
    summary: 'Test gateway connection',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id;

  // Check if gateway exists and user has access
  const gateway = await gatewayModel.findById(String(id));
  if (!gateway) {
    res.status(404).json({
      success: false,
      message: 'Gateway not found'
    });
    return;
  }

  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!gateway.facility_id || !user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only test gateways in your assigned facilities.'
      });
      return;
    }
  }

  // Validate gateway configuration before testing connection
  if (!validateGatewayConfigurationForTesting(gateway)) {
    res.status(400).json({
      success: false,
      message: 'Gateway configuration is incomplete. Please provide required connection details.',
      error: 'Missing required configuration fields for gateway type.'
    });
    return;
  }

  try {
    // Import GatewayService dynamically to avoid circular dependencies
    const { GatewayService } = await import('../services/gateway/gateway.service');
    const gatewayService = GatewayService.getInstance();

    // Get or initialize gateway
    let gatewayInstance = gatewayService.getGateway(String(id));

    if (!gatewayInstance) {
      console.log(`Initializing gateway ${id} for lock fetch test...`);
      try {
        await gatewayService.initializeGateway(gateway);
        gatewayInstance = gatewayService.getGateway(String(id));
        if (!gatewayInstance) {
          throw new Error('Failed to initialize gateway');
        }
      } catch (initError) {
        console.error(`Failed to initialize gateway ${id}:`, initError);
        res.status(500).json({
          success: false,
          message: 'Gateway not properly configured or initialized',
          error: initError instanceof Error ? initError.message : 'Unknown initialization error'
        });
        return;
      }
    }

    // Perform a sync to fetch locks (test connection by actually fetching data)
    // Don't update status for test connection - just fetch locks
    const syncResult = await gatewayInstance.sync(false);

    // Check for critical connection errors
    const hasCriticalErrors = syncResult?.syncResults?.errors?.some((error: string) =>
      error.includes('API endpoint may not exist') ||
      error.includes('base URL is incorrect') ||
      error.includes('HTML response instead of JSON') ||
      error.includes('API endpoint not found') ||
      error.includes('Cannot connect to gateway') ||
      error.includes('Authentication failed')
    );

    if (hasCriticalErrors) {
      res.status(400).json({
        success: false,
        message: 'Gateway lock fetch failed - connection or configuration issue',
        error: syncResult.syncResults.errors.join('; ')
      });
      return;
    }

    // Success - return lock count and basic info
    res.json({
      success: true,
      message: `Gateway lock fetch successful - found ${syncResult.syncResults.devicesFound} locks`,
      data: {
        devicesFound: syncResult.syncResults.devicesFound,
        devicesSynced: syncResult.syncResults.devicesSynced,
        keysRetrieved: syncResult.syncResults.keysRetrieved,
        errors: syncResult.syncResults.errors.length > 0 ? syncResult.syncResults.errors : undefined
      }
    });

  } catch (error) {
    console.error(`Gateway lock fetch test failed for ${id}:`, error);

    // Provide more specific error messages
    let errorMessage = 'Gateway lock fetch failed';
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to gateway. Please check the gateway URL and network connectivity.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. Please check gateway credentials.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Gateway may be offline or unresponsive.';
      } else {
        errorMessage = error.message;
      }
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// POST /api/gateways/:id/sync - Manually sync gateway
registerPost(
  router,
  '/:id/sync',
  {
    openApiPath: `${MOUNT}/{id}/sync`,
    tags: ['Gateway'],
    summary: 'Manually sync gateway',
    security: 'bearer',
    params: gatewayResourceIdParamSchema,
    responses: { 200: gatewayResponseSchema },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id;

  // Check if gateway exists and user has access
  const gateway = await gatewayModel.findById(String(id));
  if (!gateway) {
    res.status(404).json({
      success: false,
      message: 'Gateway not found'
    });
    return;
  }

  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!gateway.facility_id || !user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only sync gateways in your assigned facilities.'
      });
      return;
    }
  }

  if (gateway.facility_id) {
    const blocking = await GatewayRecoveryService.isBlockingActiveForFacility(gateway.facility_id);
    if (blocking) {
      res.status(409).json({
        success: false,
        code: 'recovery_in_progress',
        message: 'Gateway recovery in progress — manual sync blocked until recovery completes or is bypassed',
      });
      return;
    }
  }

  try {
    // Import GatewayService dynamically to avoid circular dependencies
    const { GatewayService } = await import('../services/gateway/gateway.service');

    const gatewayService = GatewayService.getInstance();
    const gatewayInstance = gatewayService.getGateway(String(id));

    if (!gatewayInstance) {
      res.status(404).json({
        success: false,
        message: 'Gateway not initialized'
      });
      return;
    }

    // Perform manual sync (update status based on result)
    const syncResult = await gatewayInstance.sync(true);

    // Check if there are critical errors that should fail the sync
    const hasCriticalErrors = syncResult?.syncResults?.errors?.some((error: string) =>
      error.includes('API endpoint may not exist') ||
      error.includes('base URL is incorrect') ||
      error.includes('HTML response instead of JSON') ||
      error.includes('API endpoint not found') ||
      error.includes('Gateway not connected') ||
      error.includes('Cannot connect to gateway')
    );

    if (hasCriticalErrors && syncResult?.syncResults?.errors) {
      res.status(400).json({
        success: false,
        message: syncResult.syncResults.errors.join('; '),
        error: syncResult.syncResults.errors.join('; '),
        data: syncResult
      });
      return;
    }

    res.json({
      success: true,
      message: 'Gateway synchronization completed successfully',
      data: syncResult !== undefined ? syncResult : null
    });
  } catch (error) {
    console.error(`Gateway sync failed for ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Gateway synchronization failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export { router as gatewayRouter };

