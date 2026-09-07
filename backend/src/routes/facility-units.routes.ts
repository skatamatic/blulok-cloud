import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { handleGetUnitsList } from '@/routes/units-list.handler';
import { registerGet } from '@/openapi/register-route';
import {
  facilityUnitsParamSchema,
  unitsListQuerySchema,
  unitsListResponseSchema,
} from '@/schemas/units-list.schemas';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/v1/facilities/:facilityId/units
 *
 * Mounted at /api/v1 (same pattern as schedules) so the path resolves even when
 * the facilities router does not define a nested handler.
 */
registerGet(
  router,
  '/facilities/:facilityId/units',
  {
    openApiPath: '/api/v1/facilities/{facilityId}/units',
    tags: ['Units', 'App'],
    summary: 'List units for a facility',
    security: 'bearer',
    params: facilityUnitsParamSchema,
    query: unitsListQuerySchema,
    responses: {
      200: unitsListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await handleGetUnitsList(req, res, String(req.params.facilityId));
  }),
);

export { router as facilityUnitsRouter };
