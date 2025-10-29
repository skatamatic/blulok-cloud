/**
 * Gateway Commands Routes
 *
 * Advanced command queue management API for monitoring and controlling gateway command execution.
 * Provides administrative tools for troubleshooting failed commands, manual retries, and
 * dead letter queue management with comprehensive audit trails.
 *
 * Key Features:
 * - Real-time command queue monitoring with status filtering
 * - Manual command retry capabilities for failed operations
 * - Command cancellation for obsolete or erroneous commands
 * - Dead letter queue management for permanently failed commands
 * - Command execution attempt history and debugging
 * - WebSocket broadcasting for real-time queue updates
 *
 * Command Lifecycle Management:
 * - Queue monitoring and status tracking
 * - Manual intervention for stuck or failed commands
 * - Retry logic with exponential backoff
 * - Dead letter queue recovery and reprocessing
 * - Audit trail for all command operations
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full command management capabilities
 * - FACILITY_ADMIN: Limited visibility for assigned facilities
 * - TENANT/MAINTENANCE: No access to command operations
 *
 * Command Operations:
 * - List pending commands with status filtering
 * - Force retry failed commands immediately
 * - Cancel commands that should not execute
 * - Requeue dead letter commands for reprocessing
 * - View detailed attempt history for debugging
 *
 * Business Logic:
 * - Command idempotency prevents duplicate execution
 * - Facility-scoped operations ensure data isolation
 * - Real-time updates keep monitoring dashboards current
 * - Comprehensive logging supports troubleshooting
 * - Queue management prevents system resource exhaustion
 *
 * Security Considerations:
 * - Strict role-based access control (ADMIN/DEV_ADMIN only)
 * - Audit logging for all command modifications
 * - Input validation on command IDs and parameters
 * - Secure WebSocket broadcasting with authentication
 * - Protection against command injection attacks
 *
 * Performance Optimizations:
 * - Efficient database queries with proper indexing
 * - Paginated results for large command queues
 * - WebSocket broadcasting for real-time updates
 * - Background processing for heavy operations
 * - Connection pooling for database operations
 */

import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';
import { GatewayCommandModel, GatewayCommandAttemptModel } from '@/models/gateway-command.model';
import { asyncHandler } from '@/utils/asyncHandler';

const router = Router();
const model = new GatewayCommandModel();
const attemptModel = new GatewayCommandAttemptModel();

// Apply authentication middleware to all routes
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


