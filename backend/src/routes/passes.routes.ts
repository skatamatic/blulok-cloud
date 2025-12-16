/**
 * Passes Routes (App)
 *
 * - POST /request: Issue a Route Pass (Ed25519 JWT) bound to the requesting device
 *   and the user's accessible lock audiences. Requires Bearer User JWT.
 *   Honors `X-App-Device-Id` to bind to the correct device public key.
 *
 * RBAC Scoping:
 * - DEV_ADMIN/ADMIN: all locks
 * - FACILITY_ADMIN: locks in their assigned facilities
 * - MAINTENANCE: locks for explicitly granted units (future)
 * - TENANT: locks for FMS-assigned units
 */
import { Router, Response } from 'express';
import Joi from 'joi';
import { passRequestLimiter } from '@/middleware/security-limits';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { RoutePassOrchestrator, RoutePassError } from '@/services/passes/route-pass.orchestrator';

const router = Router();

// Rate limit pass requests

// POST /api/v1/passes/request
router.post('/request', authenticateToken, passRequestLimiter, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rawHeader = req.header('X-App-Device-Id');
  try {
    const routePass = await RoutePassOrchestrator.issueForUser({
      userId: req.user!.userId,
      role: req.user!.role,
      facilityIds: req.user!.facilityIds as string[] | undefined,
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
}));

export { router as passesRouter };


