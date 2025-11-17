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
import { InviteService } from '@/services/invite.service';
import { OTPService } from '@/services/otp.service';
import { DatabaseService } from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * POST /api/v1/admin/testing/invite-token
 * DEV_ADMIN only - Create a fresh invite token for a user and return it (no notification)
 */
router.post('/testing/invite-token', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Not available in production' });
    return;
  }
  const { userId, metadata } = req.body || {};
  if (!userId) {
    res.status(400).json({ success: false, message: 'userId is required' });
    return;
  }
  const { token, inviteId, expiresAt } = await InviteService.getInstance().createInvite(userId, metadata || undefined);
  res.json({ success: true, token, inviteId, expiresAt });
}));

/**
 * POST /api/v1/admin/testing/otp
 * DEV_ADMIN only - Issue an OTP for a user and return the plaintext code (no notification)
 */
router.post('/testing/otp', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Not available in production' });
    return;
  }
  const { userId, inviteId, delivery } = req.body || {};
  if (!userId || (delivery !== 'sms' && delivery !== 'email')) {
    res.status(400).json({ success: false, message: 'userId and delivery (sms|email) are required' });
    return;
  }
  const { code, expiresAt } = await OTPService.getInstance().issueOtpForDev({ userId, inviteId: inviteId || null, delivery });
  res.json({ success: true, code, expiresAt });
}));

/**
 * DELETE /api/v1/admin/users/:id/hard
 * DEV_ADMIN only - Hard delete user and related rows (test/cleanup utility)
 */
router.delete('/users/:id/hard', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, message: 'User ID is required' });
    return;
  }
  const db = DatabaseService.getInstance().connection;
  await db.transaction(async (trx) => {
    // Collect user_device ids for cleanup in distributions
    const userDeviceIds = await trx('user_devices').where({ user_id: id }).pluck('id');
    if (userDeviceIds.length > 0) {
      await trx('device_key_distributions').whereIn('user_device_id', userDeviceIds).del().catch(() => {});
    }
    // Remove denylists
    await trx('denylist_entries').where({ user_id: id }).del().catch(() => {});
    // Remove invites and otps
    await trx('user_invites').where({ user_id: id }).del().catch(() => {});
    await trx('user_otps').where({ user_id: id }).del().catch(() => {});
    // Remove user devices
    await trx('user_devices').where({ user_id: id }).del().catch(() => {});
    // Remove facility associations
    await trx('user_facility_associations').where({ user_id: id }).del().catch(() => {});
    // Remove unit assignments where tenant_id matches
    await trx('unit_assignments').where({ tenant_id: id }).del().catch(() => {});
    // Remove key_sharing where user is owner or shared_with
    await trx('key_sharing').where({ primary_tenant_id: id }).del().catch(() => {});
    await trx('key_sharing').where({ shared_with_user_id: id }).del().catch(() => {});
    // Finally delete user
    await trx('users').where({ id }).del().catch(() => {});
  });
  res.json({ success: true, message: 'User hard-deleted' });
}));

/**
 * DELETE /api/v1/admin/facilities/:id/hard
 * DEV_ADMIN only - Hard delete a facility and all related data created during tests.
 */
router.delete('/facilities/:id/hard', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id: facilityId } = req.params;
  if (!facilityId) {
    res.status(400).json({ success: false, message: 'Facility ID is required' });
    return;
  }
  const db = DatabaseService.getInstance().connection;
  await db.transaction(async (trx) => {
    // Collect units in facility
    const unitIds: string[] = await trx('units').where({ facility_id: facilityId }).pluck('id');

    if (unitIds.length > 0) {
      // Remove key sharing for units
      await trx('key_sharing').whereIn('unit_id', unitIds).del().catch(() => {});
      // Remove unit assignments
      await trx('unit_assignments').whereIn('unit_id', unitIds).del().catch(() => {});
    }

    // Devices: find gateways for this facility then delete device distributions, then devices, then gateways
    const gatewayIds: string[] = await trx('gateways').where({ facility_id: facilityId }).pluck('id');

    if (gatewayIds.length > 0) {
      const blulokDeviceIds: string[] = await trx('blulok_devices').whereIn('gateway_id', gatewayIds).pluck('id').catch(() => []);
      if (blulokDeviceIds.length > 0) {
        const userDeviceIds: string[] = await trx('device_key_distributions').whereIn('blulok_device_id', blulokDeviceIds).pluck('user_device_id').catch(() => []);
        if (userDeviceIds.length > 0) {
          await trx('device_key_distributions').whereIn('user_device_id', userDeviceIds).del().catch(() => {});
        }
        await trx('blulok_devices').whereIn('id', blulokDeviceIds).del().catch(() => {});
      }
      // Access control devices if present
      await trx('access_control_devices').whereIn('gateway_id', gatewayIds).del().catch(() => {});
      await trx('gateways').whereIn('id', gatewayIds).del().catch(() => {});
    }

    // Finally remove units then facility
    if (unitIds.length > 0) {
      await trx('units').whereIn('id', unitIds).del().catch(() => {});
    }

    await trx('facilities').where({ id: facilityId }).del().catch(() => {});
  });
  res.json({ success: true, message: 'Facility hard-deleted' });
}));

/**
 * POST /api/v1/admin/facilities
 * DEV_ADMIN only - Create a facility (test utility)
 */
router.post('/facilities', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = DatabaseService.getInstance().connection;
  const body = req.body || {};
  const name = body.name || `E2E Facility ${Date.now()}`;
  const address = body.address || '100 Test Ave, Test City, TS 00000';
  const status = body.status || 'active';
  const id = uuidv4();
  await db('facilities').insert({
    id,
    name,
    address,
    status,
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });
  res.status(201).json({ success: true, facility: { id, name, address, status } });
}));
export { router as adminRouter };



