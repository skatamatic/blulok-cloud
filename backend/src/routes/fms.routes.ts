/**
 * FMS (Facility Management System) Routes
 *
 * Comprehensive API for Facility Management System integration and data synchronization.
 * Provides configuration management, sync operations, change review workflows, and
 * webhook support for automated data updates from external FMS providers.
 *
 * Key Features:
 * - Multi-provider FMS integration (Storedge, Generic REST, etc.)
 * - Automated data synchronization with conflict resolution
 * - Human review workflow for data changes
 * - Webhook support for real-time updates
 * - Comprehensive audit trails and error handling
 * - Role-based access control with facility scoping
 *
 * Integration Workflow:
 * 1. Configure FMS provider settings per facility
 * 2. Test connection and validate credentials
 * 3. Trigger manual or scheduled synchronization
 * 4. Review detected changes (create, update, delete)
 * 5. Accept/reject changes with human oversight
 * 6. Apply approved changes to the system
 * 7. Monitor sync status and error handling
 *
 * Supported Operations:
 * - FMS configuration CRUD operations
 * - Connection testing and validation
 * - Manual and scheduled synchronization
 * - Change detection and conflict resolution
 * - Bulk change review and application
 * - Sync history and status monitoring
 * - Webhook event processing (planned)
 *
 * Security Considerations:
 * - Facility-scoped access control
 * - Provider credential encryption
 * - Input validation and sanitization
 * - Audit logging for all operations
 * - Secure webhook signature validation (planned)
 * - Role-based permission enforcement
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { FMSService } from '@/services/fms/fms.service';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  createFmsConfigSchema,
  updateFmsConfigSchema,
  fmsConfigIdParamSchema,
  fmsFacilityIdParamSchema,
  fmsSyncLogIdParamSchema,
  fmsSyncHistoryQuerySchema,
  reviewFmsChangesSchema,
  applyFmsChangesSchema,
  fmsConfigResponseSchema,
  fmsConfigCreateResponseSchema,
  fmsConfigMutationResponseSchema,
  fmsConnectionTestResponseSchema,
  fmsSyncResponseSchema,
  fmsSyncCancelResponseSchema,
  fmsSyncHistoryResponseSchema,
  fmsSyncLogResponseSchema,
  fmsPendingChangesResponseSchema,
  fmsReviewChangesResponseSchema,
  fmsApplyChangesResponseSchema,
  fmsWebhookResponseSchema,
} from '@/schemas/fms.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/fms';

router.use(authenticateToken);

const getFMSService = () => FMSService.getInstance();
const getFMSConfigModel = () => new FMSConfigurationModel();
const getSyncLogModel = () => new FMSSyncLogModel();

registerPost(
  router,
  '/config',
  {
    openApiPath: `${MOUNT}/config`,
    tags: ['FMS'],
    summary: 'Create FMS configuration for a facility',
    description: 'Requires ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot create/modify FMS config).',
    security: 'bearer',
    body: createFmsConfigSchema,
    responses: {
      201: fmsConfigCreateResponseSchema,
      400: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { facility_id, provider_type, config, is_enabled } = req.body;

    const existingConfig = await getFMSConfigModel().findByFacilityId(facility_id);
    if (existingConfig) {
      res.status(409).json({
        success: false,
        message: 'FMS configuration already exists for this facility',
      });
      return;
    }

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
  }),
);

registerGet(
  router,
  '/config/:facilityId',
  {
    openApiPath: `${MOUNT}/config/{facilityId}`,
    tags: ['FMS'],
    summary: 'Get FMS configuration for a facility',
    security: 'bearer',
    params: fmsFacilityIdParamSchema,
    responses: {
      200: fmsConfigResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
        });
        return;
      }
    }

    const config = await getFMSConfigModel().findByFacilityId(facilityId);

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found',
      });
      return;
    }

    res.json({
      success: true,
      config,
    });
  }),
);

registerPut(
  router,
  '/config/:id',
  {
    openApiPath: `${MOUNT}/config/{id}`,
    tags: ['FMS'],
    summary: 'Update FMS configuration',
    description: 'Requires ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot modify FMS config).',
    security: 'bearer',
    params: fmsConfigIdParamSchema,
    body: updateFmsConfigSchema,
    responses: {
      200: fmsConfigCreateResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { provider_type, config, is_enabled } = req.body;

    const existingConfig = await getFMSConfigModel().findById(id);
    if (!existingConfig) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found',
      });
      return;
    }

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
  }),
);

registerDelete(
  router,
  '/config/:id',
  {
    openApiPath: `${MOUNT}/config/{id}`,
    tags: ['FMS'],
    summary: 'Delete FMS configuration',
    description: 'Requires ADMIN or DEV_ADMIN role only (FACILITY_ADMIN cannot delete FMS config).',
    security: 'bearer',
    params: fmsConfigIdParamSchema,
    responses: {
      200: fmsConfigMutationResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const existingConfig = await getFMSConfigModel().findById(id);
    if (!existingConfig) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found',
      });
      return;
    }

    await getFMSConfigModel().delete(id);

    res.json({
      success: true,
      message: 'FMS configuration deleted successfully',
    });
  }),
);

registerPost(
  router,
  '/config/:id/test',
  {
    openApiPath: `${MOUNT}/config/{id}/test`,
    tags: ['FMS'],
    summary: 'Test FMS connection',
    security: 'bearer',
    params: fmsConfigIdParamSchema,
    responses: {
      200: fmsConnectionTestResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: fmsConnectionTestResponseSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;

    const config = await getFMSConfigModel().findById(id);
    if (!config) {
      res.status(404).json({
        success: false,
        message: 'FMS configuration not found',
      });
      return;
    }

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(config.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
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
  }),
);

registerPost(
  router,
  '/sync/:facilityId',
  {
    openApiPath: `${MOUNT}/sync/{facilityId}`,
    tags: ['FMS'],
    summary: 'Trigger manual FMS sync',
    security: 'bearer',
    params: fmsFacilityIdParamSchema,
    responses: {
      200: fmsSyncResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
        });
        return;
      }
    }

    const result = await getFMSService().performSync(facilityId, user.userId, user.role);

    res.json({
      success: result.success,
      message: result.success ? 'Sync completed successfully' : 'Sync completed with errors',
      result,
    });
  }),
);

registerPost(
  router,
  '/sync/:facilityId/cancel',
  {
    openApiPath: `${MOUNT}/sync/{facilityId}/cancel`,
    tags: ['FMS'],
    summary: 'Cancel an active FMS sync',
    security: 'bearer',
    params: fmsFacilityIdParamSchema,
    responses: {
      200: fmsSyncCancelResponseSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
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
  }),
);

registerGet(
  router,
  '/sync/:facilityId/history',
  {
    openApiPath: `${MOUNT}/sync/{facilityId}/history`,
    tags: ['FMS'],
    summary: 'Get sync history for a facility',
    security: 'bearer',
    params: fmsFacilityIdParamSchema,
    query: fmsSyncHistoryQuerySchema,
    responses: {
      200: fmsSyncHistoryResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.params;
    const { limit, offset } = req.query;

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
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
  }),
);

registerGet(
  router,
  '/sync/:syncLogId',
  {
    openApiPath: `${MOUNT}/sync/{syncLogId}`,
    tags: ['FMS'],
    summary: 'Get sync details',
    security: 'bearer',
    params: fmsSyncLogIdParamSchema,
    responses: {
      200: fmsSyncLogResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId } = req.params;

    const syncLog = await getSyncLogModel().findById(syncLogId);

    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found',
      });
      return;
    }

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this sync log',
        });
        return;
      }
    }

    res.json({
      success: true,
      syncLog,
    });
  }),
);

registerGet(
  router,
  '/changes/:syncLogId/pending',
  {
    openApiPath: `${MOUNT}/changes/{syncLogId}/pending`,
    tags: ['FMS'],
    summary: 'Get pending changes for review',
    security: 'bearer',
    params: fmsSyncLogIdParamSchema,
    responses: {
      200: fmsPendingChangesResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId } = req.params;

    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found',
      });
      return;
    }

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied',
        });
        return;
      }
    }

    const changes = (await getFMSService().getPendingChanges(syncLogId)).map((c) => {
      if (c.is_valid === false && (!c.validation_errors || c.validation_errors.length === 0)) {
        const derived: string[] = [];
        const tenantPayload: any = c.after_data ?? c.before_data;
        if (c.entity_type === 'tenant' && tenantPayload) {
          const email = (tenantPayload.email ?? tenantPayload.login_identifier) as string | null | undefined;
          const firstName = (tenantPayload.firstName ?? tenantPayload.first_name) as string | null | undefined;
          const lastName = (tenantPayload.lastName ?? tenantPayload.last_name) as string | null | undefined;
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
  }),
);

registerPost(
  router,
  '/changes/review',
  {
    openApiPath: `${MOUNT}/changes/review`,
    tags: ['FMS'],
    summary: 'Review changes (accept or reject)',
    security: 'bearer',
    body: reviewFmsChangesSchema,
    responses: {
      200: fmsReviewChangesResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId, changeIds, accepted } = req.body;

    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found',
      });
      return;
    }

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
        });
        return;
      }
    }

    await getFMSService().reviewChanges(changeIds, accepted);

    res.json({
      success: true,
      message: `${changeIds.length} change(s) ${accepted ? 'accepted' : 'rejected'}`,
    });
  }),
);

registerPost(
  router,
  '/changes/apply',
  {
    openApiPath: `${MOUNT}/changes/apply`,
    tags: ['FMS'],
    summary: 'Apply accepted changes',
    security: 'bearer',
    body: applyFmsChangesSchema,
    responses: {
      200: fmsApplyChangesResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: fmsApplyChangesResponseSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { syncLogId, changeIds } = req.body;

    const syncLog = await getSyncLogModel().findById(syncLogId);
    if (!syncLog) {
      res.status(404).json({
        success: false,
        message: 'Sync log not found',
      });
      return;
    }

    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(syncLog.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this facility',
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
  }),
);

registerPost(
  router,
  '/webhook/:facilityId',
  {
    openApiPath: `${MOUNT}/webhook/{facilityId}`,
    tags: ['FMS'],
    summary: 'Webhook receiver for FMS events',
    description: 'TODO: Implement webhook signature validation per provider.',
    security: 'bearer',
    params: fmsFacilityIdParamSchema,
    responses: {
      200: fmsWebhookResponseSchema,
    },
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.json({
      success: true,
      message: 'Webhook received (processing not yet implemented)',
    });
  }),
);

export { router as fmsRouter };
