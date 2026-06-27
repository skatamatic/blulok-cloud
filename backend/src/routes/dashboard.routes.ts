import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { GeneralStatsService } from '@/services/general-stats.service';
import { registerGet } from '@/openapi/register-route';
import {
  generalStatsQuerySchema,
  dashboardResponseSchema,
} from '@/schemas/dashboard.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/dashboard';

/**
 * GET /api/v1/dashboard/general-stats
 * Initial dashboard statistics (same payload as WebSocket general_stats_update).
 * Used for first paint and when WebSocket is unavailable.
 *
 * Query `facility_id`: when set, counts are limited to that facility (must be accessible to the user).
 */
router.use(authenticateToken);

registerGet(
  router,
  '/general-stats',
  {
    openApiPath: `${MOUNT}/general-stats`,
    tags: ['Dashboard'],
    summary: 'Get scoped dashboard statistics',
    security: 'bearer',
    query: generalStatsQuerySchema,
    responses: {
      200: dashboardResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
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
  }),
);

export default router;
