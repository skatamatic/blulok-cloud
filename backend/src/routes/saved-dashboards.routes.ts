/**
 * Saved dashboard library routes — org-wide templates (admin/dev_admin only).
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { SavedDashboardModel } from '@/models/saved-dashboard.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { buildDashboardApiResponse } from '@/services/dashboard-layout.service';
import { parseActiveFacilityContext } from '@/utils/dashboard-assignment.utils';
import { DashboardLayoutBroadcastService } from '@/services/dashboard-layout-broadcast.service';

const router = Router();

router.use(authenticateToken as never);
router.use(requireAdmin);

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
});

const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
}).min(1);

function isDuplicateNameError(error: unknown): boolean {
  const err = error as { code?: string; errno?: number };
  return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
}

// GET /saved-dashboards
router.get(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const dashboards = await SavedDashboardModel.listAll();
    res.json({ success: true, dashboards });
  })
);

// POST /saved-dashboards — snapshot caller's current working layout
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { error, value } = createSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0]?.message || 'Validation error',
      });
      return;
    }

    try {
      const saved = await SavedDashboardModel.createFromUserWorkingLayout(
        userId,
        value.name,
        value.description
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
  })
);

// PUT /saved-dashboards/:id/snapshot — replace template snapshot from caller's working layout
router.put(
  '/:id/snapshot',
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
  })
);

// PATCH /saved-dashboards/:id
router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0]?.message || 'Validation error',
      });
      return;
    }

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
  })
);

// DELETE /saved-dashboards/:id
router.delete(
  '/:id',
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
  })
);

// POST /saved-dashboards/:id/load — apply snapshot to caller's working dashboard
router.post(
  '/:id/load',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const activeFacilityId = req.body?.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? []
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
  })
);

export { router as savedDashboardsRouter };
