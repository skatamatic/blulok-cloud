import { Router, Response } from 'express';
import { authenticateToken, requireDevAdmin } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { RoutePassIssuanceModel } from '@/models/route-pass-issuance.model';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * GET /api/v1/route-passes/users/:userId
 * 
 * Get route pass issuance history for a user (DEV_ADMIN only).
 * Supports pagination and optional date filtering.
 */
router.get('/users/:userId', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
    return;
  }

  try {
    const routePassModel = new RoutePassIssuanceModel();

    // Parse query parameters
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Validate pagination
    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100'
      });
      return;
    }

    if (offset < 0) {
      res.status(400).json({
        success: false,
        message: 'Offset must be non-negative'
      });
      return;
    }

    // Validate dates
    if (startDate && isNaN(startDate.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid startDate format'
      });
      return;
    }

    if (endDate && isNaN(endDate.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid endDate format'
      });
      return;
    }

    // Fetch history
    const history = await routePassModel.getUserHistory(userId, {
      limit,
      offset,
      startDate,
      endDate,
    });

    const total = await routePassModel.getUserHistoryCount(userId, {
      startDate,
      endDate,
    });

    // Enrich with device information (optional - could be expanded)
    const enrichedHistory = history.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      deviceId: entry.device_id,
      audiences: entry.audiences,
      jti: entry.jti,
      issuedAt: entry.issued_at,
      expiresAt: entry.expires_at,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      isExpired: new Date() > entry.expires_at,
    }));

    res.json({
      success: true,
      data: enrichedHistory,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch route pass history for user ${userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route pass history'
    });
  }
}));

export { router as routePassesRouter };

