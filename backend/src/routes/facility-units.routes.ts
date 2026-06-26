import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { handleGetUnitsList } from '@/routes/units-list.handler';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/v1/facilities/:facilityId/units
 *
 * Mounted at /api/v1 (same pattern as schedules) so the path resolves even when
 * the facilities router does not define a nested handler.
 */
router.get(
  '/facilities/:facilityId/units',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await handleGetUnitsList(req, res, String(req.params.facilityId));
  }),
);

export { router as facilityUnitsRouter };
