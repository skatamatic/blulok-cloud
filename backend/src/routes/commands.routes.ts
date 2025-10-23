import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { GatewayCommandModel, GatewayCommandAttemptModel } from '@/models/gateway-command.model';
import { asyncHandler } from '@/utils/asyncHandler';

const router = Router();
const model = new GatewayCommandModel();
const attemptModel = new GatewayCommandAttemptModel();

router.use(authenticateToken);

router.get('/pending', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const { status, limit = '50', offset = '0' } = req.query as any;
  const facilities: string[] | undefined = (user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN) ? undefined : (user.facilityIds || undefined);
  const statuses = status ? String(status).split(',') as any : undefined;
  const result = await model.list({ facilities: facilities || undefined, statuses }, parseInt(String(limit)), parseInt(String(offset)));
  res.json({ success: true, ...result });
}));

router.post('/:id/retry', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' });
    return;
  }
  await model.retryNow(String(req.params.id));
  const { WebSocketService } = await import('@/services/websocket.service');
  await WebSocketService.getInstance().broadcastCommandQueueUpdate();
  res.json({ success: true });
}));

router.post('/:id/cancel', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' });
    return;
  }
  await model.cancel(String(req.params.id));
  const { WebSocketService } = await import('@/services/websocket.service');
  await WebSocketService.getInstance().broadcastCommandQueueUpdate();
  res.json({ success: true });
}));

router.post('/:id/requeue-dead', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' });
    return;
  }
  await model.requeueDead(String(req.params.id));
  const { WebSocketService } = await import('@/services/websocket.service');
  await WebSocketService.getInstance().broadcastCommandQueueUpdate();
  res.json({ success: true });
}));

router.get('/:id/attempts', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  // Admin/Dev Admin only for full audit visibility
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' });
    return;
  }
  const items = await attemptModel.listByCommand(String(req.params.id));
  res.json({ success: true, items });
}));

export default router;


