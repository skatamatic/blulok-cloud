/**
 * Saved dashboard library routes — org-wide templates (admin/dev_admin only).
 */

import { Router, Response } from 'express';
import { SavedDashboardModel } from '@/models/saved-dashboard.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { buildDashboardApiResponse } from '@/services/dashboard-layout.service';
import { parseActiveFacilityContext } from '@/utils/dashboard-assignment.utils';
import { DashboardLayoutBroadcastService } from '@/services/dashboard-layout-broadcast.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerPatch,
  registerDelete,
} from '@/openapi/register-route';
import {
  savedDashboardCreateSchema,
  savedDashboardUpdateSchema,
  savedDashboardLoadSchema,
  savedDashboardIdParamSchema,
  dashboardResponseSchema,
} from '@/schemas/dashboard.schemas';

const router = Router();
const MOUNT = '/api/v1/saved-dashboards';

router.use(authenticateToken as never);
router.use(requireAdmin);

function isDuplicateNameError(error: unknown): boolean {
  const err = error as { code?: string; errno?: number };
  return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
}

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard'],
    summary: 'List saved dashboards',
    security: 'bearer',
    responses: {
      200: dashboardResponseSchema,
    },
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const dashboards = await SavedDashboardModel.listAll();
    res.json({ success: true, dashboards });
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard'],
    summary: 'Create saved dashboard from working layout',
    security: 'bearer',
    body: savedDashboardCreateSchema,
    responses: {
      201: dashboardResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const value = req.body;

    try {
      const saved = await SavedDashboardModel.createFromUserWorkingLayout(
        userId,
        value.name,
        value.description,
      );
      res.status(201).json({
        success: true,
        dashboard: {
          id: (saved as { id: string }).id,
          name: (saved as { name: string }).name,
          description: (saved as { description: string | null }).description,
        },
      });
    } catch (err) {
      if (isDuplicateNameError(err)) {
        res.status(409).json({
          success: false,
          message: 'A saved dashboard with this name already exists',
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to save dashboard';
      res.status(400).json({ success: false, message });
    }
  }),
);

registerPut(
  router,
  '/:id/snapshot',
  {
    openApiPath: `${MOUNT}/{id}/snapshot`,
    tags: ['Dashboard'],
    summary: 'Update saved dashboard snapshot from working layout',
    security: 'bearer',
    params: savedDashboardIdParamSchema,
    responses: {
      200: dashboardResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const existing = await SavedDashboardModel.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Saved dashboard not found' });
      return;
    }

    try {
      const updated = await SavedDashboardModel.updateSnapshotFromUserWorkingLayout(id, userId);
      await DashboardLayoutBroadcastService.notifyForSavedDashboard(id);
      res.json({
        success: true,
        message: 'Template updated successfully',
        dashboard: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          pageCount: updated.page_count,
          widgetCount: updated.widget_count,
          updatedAt: updated.updated_at,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update template';
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message });
    }
  }),
);

registerPatch(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Dashboard'],
    summary: 'Update saved dashboard metadata',
    security: 'bearer',
    params: savedDashboardIdParamSchema,
    body: savedDashboardUpdateSchema,
    responses: {
      200: dashboardResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const value = req.body;

    const existing = await SavedDashboardModel.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Saved dashboard not found' });
      return;
    }

    if (value.name && value.name !== existing.name) {
      const nameTaken = await SavedDashboardModel.findByName(value.name);
      if (nameTaken && nameTaken.id !== id) {
        res.status(409).json({
          success: false,
          message: 'A saved dashboard with this name already exists',
        });
        return;
      }
    }

    try {
      const updated = await SavedDashboardModel.updateMetadata(id, userId, value);
      await DashboardLayoutBroadcastService.notifyForSavedDashboard(id);
      res.json({
        success: true,
        dashboard: {
          id: updated!.id,
          name: updated!.name,
          description: updated!.description,
        },
      });
    } catch (err) {
      if (isDuplicateNameError(err)) {
        res.status(409).json({
          success: false,
          message: 'A saved dashboard with this name already exists',
        });
        return;
      }
      throw err;
    }
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Dashboard'],
    summary: 'Delete saved dashboard',
    security: 'bearer',
    params: savedDashboardIdParamSchema,
    responses: {
      200: dashboardResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const existing = await SavedDashboardModel.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Saved dashboard not found' });
      return;
    }
    const refCount = await SavedDashboardModel.countAssignmentsReferencing(id);
    if (refCount > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete: ${refCount} assignment rule(s) reference this template`,
      });
      return;
    }
    await SavedDashboardModel.deleteById(id);
    res.json({ success: true, message: 'Saved dashboard deleted' });
  }),
);

registerPost(
  router,
  '/:id/load',
  {
    openApiPath: `${MOUNT}/{id}/load`,
    tags: ['Dashboard'],
    summary: 'Load saved dashboard into working layout',
    security: 'bearer',
    params: savedDashboardIdParamSchema,
    body: savedDashboardLoadSchema,
    responses: {
      200: dashboardResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const activeFacilityId = req.body?.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? [],
    );

    try {
      await SavedDashboardModel.loadIntoUserWorkingLayout(id, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message });
      return;
    }

    const response = await buildDashboardApiResponse(userId, role, facilityContext);
    res.json({
      success: true,
      message: 'Dashboard loaded successfully',
      ...response,
    });
  }),
);

export { router as savedDashboardsRouter };
