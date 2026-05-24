/**
 * Dashboard assignment CRUD routes (admin/dev_admin only).
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import {
  DashboardAssignmentModel,
  CreateAssignmentPayload,
} from '@/models/saved-dashboard.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { UserRole } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { DashboardLayoutBroadcastService } from '@/services/dashboard-layout-broadcast.service';

const router = Router();
const USER_ROLES = Object.values(UserRole);

router.use(authenticateToken as never);
router.use(requireAdmin);

const createSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().required(),
  scope: Joi.string().valid('global', 'facility', 'user').required(),
  facilityId: Joi.string().uuid().allow(null).optional(),
  userId: Joi.string().uuid().allow(null).optional(),
  targetRole: Joi.string()
    .valid(...USER_ROLES)
    .required(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
});

const updateSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().optional(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
}).min(1);

router.get(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const assignments = await DashboardAssignmentModel.listAll();
    res.json({ success: true, assignments });
  })
);

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
      const created = await DashboardAssignmentModel.createAssignment(
        userId,
        value as CreateAssignmentPayload
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
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0]?.message || 'Validation error',
      });
      return;
    }

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
  })
);

router.delete(
  '/:id',
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
  })
);

export { router as dashboardAssignmentsRouter };
