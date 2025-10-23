/**
 * FMS (Facility Management System) Routes
 * 
 * API endpoints for FMS integration management
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { FMSService } from '@/services/fms/fms.service';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Lazy-load models and services to avoid initialization order issues
const getFMSService = () => FMSService.getInstance();
const getFMSConfigModel = () => new FMSConfigurationModel();
const getSyncLogModel = () => new FMSSyncLogModel();

/**
 * POST /api/v1/fms/config
 * Create FMS configuration for a facility
 * Requires: ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot create/modify FMS config)
 */
router.post('/config',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facility_id, provider_type, config, is_enabled } = req.body;

    // Validate input
    if (!facility_id || !provider_type || !config) {
      res.status(400).json({
        success: false,
        message: 'facility_id, provider_type, and config are required'
      });
      return;
    }

    // Check if config already exists
    const existingConfig = await getFMSConfigModel().findByFacilityId(facility_id);
    if (existingConfig) {
      res.status(409).json({
        success: false,
        message: 'FMS configuration already exists for this facility'
      });
      return;
    }

    // Create configuration
    const fmsConfig = await getFMSConfigModel().create({
      facility_id,
      provider_type,
      config,
      is_enabled: is_enabled ?? false,
    });

    res.status(201).json({
      success: true,
      message: 'FMS configuration created successfully',
      config: fmsConfig,
    });
  })
);

/**
 * GET /api/v1/fms/config/:facilityId
 * Get FMS configuration for a facility
 */
router.get('/config/:facilityId',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (!facilityId) {
      res.status(400).json({
        success: false,
        message: 'Facility ID is required'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    const config = await getFMSConfigModel().findByFacilityId(facilityId);

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found'
      });
      return;
    }

    res.json({
      success: true,
      config,
    });
  })
);

/**
 * PUT /api/v1/fms/config/:id
 * Update FMS configuration
 * Requires: ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot modify FMS config)
 */
router.put('/config/:id',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { provider_type, config, is_enabled } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Configuration ID is required'
      });
      return;
    }

    // Get existing config
    const existingConfig = await getFMSConfigModel().findById(id);
    if (!existingConfig) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found'
      });
      return;
    }

    // Update configuration
    const updatedConfig = await getFMSConfigModel().update(id, {
      provider_type,
      config,
      is_enabled,
    });

    res.json({
      success: true,
      message: 'FMS configuration updated successfully',
      config: updatedConfig,
    });
  })
);

/**
 * DELETE /api/v1/fms/config/:id
 * Delete FMS configuration
 * Requires: ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot delete FMS config)
 */
router.delete('/config/:id',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Configuration ID is required'
      });
      return;
    }

    // Get existing config
    const existingConfig = await getFMSConfigModel().findById(id);
    if (!existingConfig) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found'
      });
      return;
    }

    await getFMSConfigModel().delete(id);

    res.json({
      success: true,
      message: 'FMS configuration deleted successfully',
    });
  })
);

/**
 * POST /api/v1/fms/config/:id/test
 * Test FMS connection
 */
router.post('/config/:id/test',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Configuration ID is required'
      });
      return;
    }

    // Get config
    const config = await getFMSConfigModel().findById(id);
    if (!config) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(config.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    try {
      const isConnected = await getFMSService().testConnection(config.facility_id);

      res.json({
        success: isConnected,
        message: isConnected ? 'Connection successful' : 'Connection failed',
        connected: isConnected,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Connection test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * POST /api/v1/fms/sync/:facilityId
 * Trigger manual FMS sync
 */
router.post('/sync/:facilityId',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (!facilityId) {
      res.status(400).json({
        success: false,
        message: 'Facility ID is required'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    try {
      const result = await getFMSService().performSync(facilityId, user.userId, user.role);

      res.json({
        success: result.success,
        message: result.success ? 'Sync completed successfully' : 'Sync completed with errors',
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Sync failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * POST /api/v1/fms/sync/:facilityId/cancel
 * Cancel an active FMS sync
 */
router.post('/sync/:facilityId/cancel',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (!facilityId) {
      res.status(400).json({
        success: false,
        message: 'Facility ID is required'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    try {
      const cancelled = getFMSService().cancelSync(facilityId);

      res.json({
        success: true,
        message: cancelled ? 'Sync cancelled successfully' : 'No active sync found to cancel',
        cancelled,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to cancel sync',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * GET /api/v1/fms/sync/:facilityId/history
 * Get sync history for a facility
 */
router.get('/sync/:facilityId/history',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { limit, offset } = req.query;

    if (!facilityId) {
      res.status(400).json({
        success: false,
        message: 'Facility ID is required'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    const result = await getSyncLogModel().findByFacilityId(facilityId, {
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
    });
  })
);

/**
 * GET /api/v1/fms/sync/:syncLogId
 * Get sync details
 */
router.get('/sync/:syncLogId',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId } = req.params;

    if (!syncLogId) {
      res.status(400).json({
        success: false,
        message: 'Sync log ID is required'
      });
      return;
    }

    const syncLog = await getSyncLogModel().findById(syncLogId);

    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this sync log'
        });
        return;
      }
    }

    res.json({
      success: true,
      syncLog,
    });
  })
);

/**
 * GET /api/v1/fms/changes/:syncLogId/pending
 * Get pending changes for review
 */
router.get('/changes/:syncLogId/pending',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId } = req.params;

    if (!syncLogId) {
      res.status(400).json({
        success: false,
        message: 'Sync log ID is required'
      });
      return;
    }

    // Get sync log to check facility access
    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found'
      });
      return;
    }

    // Check access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied'
        });
        return;
      }
    }

    // Retrieve pending changes and ensure validation_errors are present for invalid items
    const changes = (await getFMSService().getPendingChanges(syncLogId)).map((c) => {
      if ((c.is_valid === false || c.is_valid === null || typeof c.is_valid === 'undefined') && (!c.validation_errors || c.validation_errors.length === 0)) {
        const derived: string[] = [];
        const after: any = c.after_data;
        if (c.entity_type === 'tenant' && after) {
          const email = after.email as string | null | undefined;
          const firstName = (after.firstName ?? after.first_name) as string | null | undefined;
          const lastName = (after.lastName ?? after.last_name) as string | null | undefined;
          if (!email || (typeof email === 'string' && email.trim() === '')) derived.push('Missing or empty email address');
          if (!firstName || (typeof firstName === 'string' && firstName.trim() === '')) derived.push('Missing or empty first name');
          if (!lastName || (typeof lastName === 'string' && lastName.trim() === '')) derived.push('Missing or empty last name');
        }
        return { ...c, validation_errors: derived.length > 0 ? derived : c.validation_errors };
      }
      return c;
    });

    res.json({
      success: true,
      changes,
      total: changes.length,
    });
  })
);

/**
 * POST /api/v1/fms/changes/review
 * Review changes (accept or reject)
 */
router.post('/changes/review',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId, changeIds, accepted } = req.body;

    if (!syncLogId || !Array.isArray(changeIds) || typeof accepted !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'syncLogId, changeIds (array), and accepted (boolean) are required'
      });
      return;
    }

    // SECURITY: Get sync log to validate facility access
    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found'
      });
      return;
    }

    // SECURITY: Check facility access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    await getFMSService().reviewChanges(changeIds, accepted);

    res.json({
      success: true,
      message: `${changeIds.length} change(s) ${accepted ? 'accepted' : 'rejected'}`,
    });
  })
);

/**
 * POST /api/v1/fms/changes/apply
 * Apply accepted changes
 */
router.post('/changes/apply',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId, changeIds } = req.body;

    if (!syncLogId || !Array.isArray(changeIds)) {
      res.status(400).json({
        success: false,
        message: 'syncLogId and changeIds (array) are required'
      });
      return;
    }

    // SECURITY: Get sync log to validate facility access
    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found'
      });
      return;
    }

    // SECURITY: Check facility access
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility'
        });
        return;
      }
    }

    try {
      const result = await getFMSService().applyChanges(syncLogId, changeIds);

      res.json({
        success: result.success,
        message: `Applied ${result.changesApplied} of ${changeIds.length} changes`,
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to apply changes',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * POST /api/v1/fms/webhook/:facilityId
 * Webhook receiver for FMS events
 * TODO: Implement webhook signature validation per provider
 */
router.post('/webhook/:facilityId',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Webhook implementation stub
    // const { facilityId } = req.params;
    // const payload = req.body;
    // const signature = req.headers['x-fms-signature'] as string;

    // TODO: Validate webhook signature
    // TODO: Parse webhook payload
    // TODO: Process event
    // TODO: Create sync log entry
    // TODO: Detect changes
    // TODO: Apply changes if auto-accept enabled

    res.json({
      success: true,
      message: 'Webhook received (processing not yet implemented)',
    });
  })
);

export { router as fmsRouter };

