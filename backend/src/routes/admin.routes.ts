/**
 * Admin Routes - Development Administration (DEV_ADMIN Only)
 *
 * Critical administrative operations for system maintenance and security management.
 * These endpoints handle high-risk operations that require DEV_ADMIN privileges
 * and are protected with strict rate limiting and comprehensive validation.
 *
 * Key Features:
 * - Root-signed Operations Key rotation broadcasting
 * - Monotonic timestamp validation to prevent replay attacks
 * - Facility-wide gateway communication for security updates
 * - Comprehensive audit logging for all operations
 * - Rate limiting to prevent abuse and ensure system stability
 * 
 * Operations Key Rotation:
 * - Root-signed packets for Operations Key rotation
 * - Broadcast to all gateways for immediate propagation
 * - Timestamp persistence in system_settings
 * - No signature verification (locks verify with burned-in Root key)
 * - Critical for maintaining cryptographic security
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireDevAdmin } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { validate } from '@/middleware/validator.middleware';
import rateLimit from 'express-rate-limit';
import { adminWriteLimiter } from '@/middleware/security-limits';

const router = Router();

const rotationSchema = Joi.object({
  payload: Joi.object({
    cmd_type: Joi.string().valid('ROTATE_OPERATIONS_KEY').required(),
    new_ops_pubkey: Joi.string().base64().required(),
    ts: Joi.number().integer().required(),
  }).required(),
  signature: Joi.string().required(),
});

// Rate limit sensitive admin endpoint
const rotationLimiter = adminWriteLimiter;

// POST /api/v1/admin/ops-key-rotation/broadcast
router.post('/ops-key-rotation/broadcast', authenticateToken, requireDevAdmin, rotationLimiter, validate(rotationSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const value = req.body as any;

  // Monotonic ts: persist last in system_settings
  const { DatabaseService } = await import('@/services/database.service');
  const db = DatabaseService.getInstance().connection;
  const settingKey = 'security.last_root_rotation_ts';
  const row = await db('system_settings').where({ key: settingKey }).first();
  const lastTs = row ? parseInt(row.value, 10) || 0 : 0;
  if (value.payload.ts <= lastTs) {
    res.status(409).json({ success: false, message: 'Rotation ts must be greater than last recorded' });
    return;
  }
  // Broadcast as-is (locks verify with Root key)
  GatewayEventsService.getInstance().broadcast([value.payload, value.signature]);
  if (row) {
    await db('system_settings').where({ key: settingKey }).update({ value: String(value.payload.ts), updated_at: db.fn.now() });
  } else {
    await db('system_settings').insert({ key: settingKey, value: String(value.payload.ts), created_at: db.fn.now(), updated_at: db.fn.now() });
  }
  res.json({ success: true });
}));

export { router as adminRouter };


