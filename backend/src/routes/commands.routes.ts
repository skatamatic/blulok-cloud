/**
 * Gateway Commands Routes
 *
 * Advanced command queue management API for monitoring and controlling gateway command execution.
 * Provides administrative tools for troubleshooting failed commands, manual retries, and
 * dead letter queue management with comprehensive audit trails.
 */

import { Router, Response } from 'express';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { GatewayCommandModel, GatewayCommandAttemptModel } from '@/models/gateway-command.model';
import { asyncHandler } from '@/utils/asyncHandler';
import { registerGet, registerPost } from '@/openapi/register-route';
import {
  commandsPendingQuerySchema,
  commandIdParamSchema,
  commandsResponseSchema,
} from '@/schemas/commands.schemas';

const router = Router();
const MOUNT = '/api/v1/commands';
const model = new GatewayCommandModel();
const attemptModel = new GatewayCommandAttemptModel();

router.use(authenticateToken);

registerGet(
  router,
  '/pending',
  {
    openApiPath: `${MOUNT}/pending`,
    tags: ['Commands'],
    summary: 'List pending gateway commands',
    security: 'bearer',
    query: commandsPendingQuerySchema,
    responses: {
      200: commandsResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { status, limit = '50', offset = '0' } = req.query as any;
    const facilities: string[] | undefined = (user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN) ? undefined : (user.facilityIds || undefined);
    const statuses = status ? String(status).split(',') as any : undefined;
    const result = await model.list({ facilities: facilities || undefined, statuses }, parseInt(String(limit)), parseInt(String(offset)));
    res.json({ success: true, ...result });
  }),
);

registerPost(
  router,
  '/:id/retry',
  {
    openApiPath: `${MOUNT}/{id}/retry`,
    tags: ['Commands'],
    summary: 'Retry a gateway command immediately',
    security: 'bearer',
    params: commandIdParamSchema,
    responses: {
      200: commandsResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await model.retryNow(String(req.params.id));
    const { WebSocketService } = await import('@/services/websocket.service');
    await WebSocketService.getInstance().broadcastCommandQueueUpdate();
    res.json({ success: true });
  }),
);

registerPost(
  router,
  '/:id/cancel',
  {
    openApiPath: `${MOUNT}/{id}/cancel`,
    tags: ['Commands'],
    summary: 'Cancel a pending gateway command',
    security: 'bearer',
    params: commandIdParamSchema,
    responses: {
      200: commandsResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await model.cancel(String(req.params.id));
    const { WebSocketService } = await import('@/services/websocket.service');
    await WebSocketService.getInstance().broadcastCommandQueueUpdate();
    res.json({ success: true });
  }),
);

registerPost(
  router,
  '/:id/requeue-dead',
  {
    openApiPath: `${MOUNT}/{id}/requeue-dead`,
    tags: ['Commands'],
    summary: 'Requeue a dead-letter gateway command',
    security: 'bearer',
    params: commandIdParamSchema,
    responses: {
      200: commandsResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await model.requeueDead(String(req.params.id));
    const { WebSocketService } = await import('@/services/websocket.service');
    await WebSocketService.getInstance().broadcastCommandQueueUpdate();
    res.json({ success: true });
  }),
);

registerGet(
  router,
  '/:id/attempts',
  {
    openApiPath: `${MOUNT}/{id}/attempts`,
    tags: ['Commands'],
    summary: 'List attempts for a gateway command',
    security: 'bearer',
    params: commandIdParamSchema,
    responses: {
      200: commandsResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const items = await attemptModel.listByCommand(String(req.params.id));
    res.json({ success: true, items });
  }),
);

export default router;
