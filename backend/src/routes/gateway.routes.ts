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
import Joi from 'joi';
import { GatewayModel } from '../models/gateway.model';
import { FacilityModel } from '../models/facility.model';
import { authenticateToken, requireAdmin, requireRoles } from '../middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';
import { asyncHandler } from '../middleware/error.middleware';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

const router = Router();
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
router.get('/status/:facilityId', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

// POST /api/gateways - Create new gateway
router.post('/', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
 
  const gatewayData = req.body;
  const gateway = await gatewayModel.create(gatewayData);
  
  res.status(201).json({ 
    success: true, 
    gateway 
  });
}));

// GET /api/gateways - Get all gateways
router.get('/', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const facilityFilter = typeof req.query.facility_id === 'string' ? req.query.facility_id : undefined;
  
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

const reassignGatewaySchema = Joi.object({
  targetFacilityId: Joi.string().trim().required(),
});

// GET /api/gateways/reassignment-candidates/:facilityId - List online gateways eligible for reassignment
router.get('/reassignment-candidates/:facilityId', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const facilityId = req.params.facilityId;

  const targetFacility = await facilityModel.findById(facilityId);
  if (!targetFacility) {
    res.status(404).json({
      success: false,
      message: 'Target facility not found',
    });
    return;
  }

  const gateways = await gatewayModel.findReassignmentCandidates();
  res.json({
    success: true,
    gateways,
  });
}));

// GET /api/gateways/:id - Get specific gateway
router.get('/:id', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    if (!gateway.facility_id || !user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only access gateways in your assigned facilities.' 
      });
      return;
    }
  }

  res.json({ 
    success: true, 
    gateway 
  });
}));

// PUT /api/gateways/:id - Update gateway
router.put('/:id', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

// PATCH /api/gateways/:id/reassign - Reassign gateway to a different facility
router.patch('/:id/reassign', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const { error, value } = reassignGatewaySchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error',
    });
    return;
  }

  const { targetFacilityId } = value as { targetFacilityId: string };

  const gateway = await gatewayModel.findById(id);
  if (!gateway) {
    res.status(404).json({
      success: false,
      message: 'Gateway not found',
    });
    return;
  }

  const targetFacility = await facilityModel.findById(targetFacilityId);
  if (!targetFacility) {
    res.status(404).json({
      success: false,
      message: 'Target facility not found',
    });
    return;
  }

  if (gateway.facility_id === targetFacilityId) {
    res.json({
      success: true,
      message: 'Gateway is already assigned to this facility',
      gateway,
    });
    return;
  }

  if (gateway.status !== 'online') {
    res.status(409).json({
      success: false,
      message: 'Only online gateways can be assigned',
    });
    return;
  }

  if (gateway.facility_id && gateway.facility_id !== targetFacilityId) {
    res.status(409).json({
      success: false,
      message: 'Gateway must be unassigned before it can be assigned to a facility',
    });
    return;
  }

  const assignmentResult = await gatewayModel.assignUnassignedGatewayToFacility(id, targetFacilityId);
  if (!assignmentResult.gateway) {
    res.status(404).json({
      success: false,
      message: 'Gateway not found',
    });
    return;
  }

  // Reinitialize gateway with updated facility context
  try {
    const { GatewayService } = await import('../services/gateway/gateway.service');
    const gatewayService = GatewayService.getInstance();
    await gatewayService.reinitializeGateway(assignmentResult.gateway);
    if (assignmentResult.displacedGatewayId) {
      const displacedGateway = await gatewayModel.findById(assignmentResult.displacedGatewayId);
      if (displacedGateway) {
        await gatewayService.reinitializeGateway(displacedGateway);
      }
    }
  } catch (reinitError) {
    console.warn(`Failed to reinitialize gateway ${id} after reassignment:`, reinitError);
  }

  res.json({
    success: true,
    message: assignmentResult.displacedGatewayId ? 'Gateway replaced successfully' : 'Gateway assigned successfully',
    gateway: assignmentResult.gateway,
    displacedGatewayId: assignmentResult.displacedGatewayId,
  });
}));

// PUT /api/gateways/:id/status - Update gateway status
router.put('/:id/status', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
router.post('/:id/test-connection', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
router.post('/:id/sync', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

