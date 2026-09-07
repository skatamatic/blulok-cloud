/**
 * Passes Routes (App)
 *
 * - POST /request: Issue a Route Pass (Ed25519 JWT) bound to the requesting device
 *   and the user's accessible lock audiences. Requires Bearer User JWT.
 *   Honors `X-App-Device-Id` to bind to the correct device public key.
 *
 * RBAC Scoping (resolved from database at issuance — not from the session JWT):
 * - DEV_ADMIN / ADMIN / FACILITY_ADMIN: empty `aud` (devices authorize via `user_role`)
 * - MAINTENANCE: locks for explicitly granted units
 * - TENANT: locks for FMS-assigned units and active shares (+ app-entry access_control)
 */
import { Router, Response } from 'express';
import Joi from 'joi';
import { passRequestLimiter } from '@/middleware/security-limits';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { RoutePassOrchestrator, RoutePassError } from '@/services/passes/route-pass.orchestrator';
import { registerPost } from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/passes';

const requestQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

const requestBodySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

const routePassResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  routePass: Joi.object().required(),
});

registerPost(
  router,
  '/request',
  {
    openApiPath: `${MOUNT}/request`,
    tags: ['Passes'],
    summary: 'Issue a route pass for the requesting device',
    security: 'bearer',
    query: requestQuerySchema,
    body: requestBodySchema,
    responses: {
      200: routePassResponseSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  authenticateToken,
  passRequestLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityIdCandidate = req.query.facility_id ?? req.body?.facility_id;
    const { error, value } = Joi.object({
      facility_id: Joi.string().uuid().optional(),
    }).validate({
      facility_id: facilityIdCandidate ? String(facilityIdCandidate) : undefined,
    });
    if (error) {
      res.status(400).json({ success: false, message: error.details[0]?.message || 'Validation error' });
      return;
    }

    const rawHeader = req.header('X-App-Device-Id');
    try {
      const routePass = await RoutePassOrchestrator.issueForUser({
        userId: req.user!.userId,
        facilityId: value.facility_id,
      }, rawHeader);

      res.json({ success: true, routePass });
    } catch (e: any) {
      if (e instanceof RoutePassError) {
        res.status(e.status).json({ success: false, message: e.message });
        return;
      }
      // Log the actual error for debugging
      console.error('Route pass error:', e);
      res.status(500).json({ success: false, message: 'Failed to issue route pass', error: process.env.NODE_ENV === 'test' ? e.message : undefined });
    }
  }),
);

export { router as passesRouter };
