import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { GeneralStatsService } from '@/services/general-stats.service';
import { validate } from '@/middleware/validator.middleware';
import Joi from 'joi';

const router = Router();

const generalStatsQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

/**
 * GET /api/v1/dashboard/general-stats
 * Initial dashboard statistics (same payload as WebSocket general_stats_update).
 * Used for first paint and when WebSocket is unavailable.
 *
 * Query `facility_id`: when set, counts are limited to that facility (must be accessible to the user).
 */
router.get(
  '/general-stats',
  authenticateToken as any,
  validate(generalStatsQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const svc = GeneralStatsService.getInstance();

    if (!svc.canSubscribeToGeneralStats(user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions for dashboard statistics',
      });
      return;
    }

    const facilityId =
      typeof req.query.facility_id === 'string' && req.query.facility_id.length > 0
        ? req.query.facility_id
        : undefined;

    const data = await svc.getScopedStats(user.userId, user.role, facilityId ? { facilityId } : undefined);
    res.json({ success: true, data });
  })
);

export default router;
