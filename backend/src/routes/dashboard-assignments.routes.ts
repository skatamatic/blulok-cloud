/**
 * Dashboard assignment CRUD routes (admin/dev_admin only).
 */

import { Router, Response } from 'express';
import {
  DashboardAssignmentModel,
  CreateAssignmentPayload,
} from '@/models/saved-dashboard.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { DashboardLayoutBroadcastService } from '@/services/dashboard-layout-broadcast.service';
import {
  registerGet,
  registerPost,
  registerPatch,
  registerDelete,
} from '@/openapi/register-route';
import {
  createDashboardAssignmentSchema,
  updateDashboardAssignmentSchema,
  dashboardAssignmentIdParamSchema,
  dashboardAssignmentListResponseSchema,
  dashboardAssignmentCreateResponseSchema,
  dashboardAssignmentUpdateResponseSchema,
  dashboardAssignmentDeleteResponseSchema,
} from '@/schemas/dashboard-assignments.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/dashboard-assignments';

router.use(authenticateToken as never);
router.use(requireAdmin);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard Assignments'],
    summary: 'List all dashboard assignment rules',
    security: 'bearer',
    responses: {
      200: dashboardAssignmentListResponseSchema,
    },
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const assignments = await DashboardAssignmentModel.listAll();
    res.json({ success: true, assignments });
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard Assignments'],
    summary: 'Create a dashboard assignment rule',
    security: 'bearer',
    body: createDashboardAssignmentSchema,
    responses: {
      201: dashboardAssignmentCreateResponseSchema,
      400: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const value = req.body;

    try {
      const created = await DashboardAssignmentModel.createAssignment(
        userId,
        value as CreateAssignmentPayload,
      );
      await DashboardLayoutBroadcastService.notifyForAssignment(created);
      res.status(201).json({
        success: true,
        assignment: {
          id: created.id,
          savedDashboardId: created.saved_dashboard_id,
          scope: created.scope,
          facilityId: created.facility_id,
          userId: created.user_id,
          targetRole: created.target_role,
          priority: created.priority,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create assignment';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, message });
    }
  }),
);

registerPatch(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Dashboard Assignments'],
    summary: 'Update a dashboard assignment rule',
    security: 'bearer',
    params: dashboardAssignmentIdParamSchema,
    body: updateDashboardAssignmentSchema,
    responses: {
      200: dashboardAssignmentUpdateResponseSchema,
      404: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const value = req.body;

    const existing = await DashboardAssignmentModel.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }

    try {
      const updated = await DashboardAssignmentModel.updateAssignment(id, value);
      if (updated) {
        await DashboardLayoutBroadcastService.notifyForAssignment(updated);
      }
      res.json({
        success: true,
        assignment: {
          id: updated!.id,
          savedDashboardId: updated!.saved_dashboard_id,
          scope: updated!.scope,
          facilityId: updated!.facility_id,
          userId: updated!.user_id,
          targetRole: updated!.target_role,
          priority: updated!.priority,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update assignment';
      res.status(400).json({ success: false, message });
    }
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Dashboard Assignments'],
    summary: 'Delete a dashboard assignment rule',
    security: 'bearer',
    params: dashboardAssignmentIdParamSchema,
    responses: {
      200: dashboardAssignmentDeleteResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const existing = await DashboardAssignmentModel.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }

    const affected = await DashboardAssignmentModel.findAffectedUserIds(existing);
    await DashboardAssignmentModel.deleteById(id);
    await DashboardLayoutBroadcastService.notifyUsers(affected);
    res.json({ success: true, message: 'Assignment deleted' });
  }),
);

export { router as dashboardAssignmentsRouter };
