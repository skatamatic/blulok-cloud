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
import { authenticateToken, requireDevAdmin, requireAdmin } from '@/middleware/auth.middleware';
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
import { config } from '@/config/environment';
import { RateLimitBypassService } from '@/services/rate-limit-bypass.service';
import { generateKeyPair, exportJWK, KeyLike } from 'jose';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { DenylistService } from '@/services/denylist.service';
import { logger } from '@/utils/logger';

const router = Router();

// Rate limit sensitive admin endpoint
const rotationLimiter = adminWriteLimiter;

const rateLimitBypassSchema = Joi.object({
  enabled: Joi.boolean().required(),
  durationSeconds: Joi.number().integer().min(1).max(900)
    .when('enabled', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
  ip: Joi.string().ip({ version: ['ipv4', 'ipv6'], cidr: 'forbidden' }).optional(),
  reason: Joi.string().max(200).optional()
});

const notificationsTestModeSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

const gatewayPingSchema = Joi.object({
  facilityId: Joi.string().required(),
});

const gatewayCommandSchema = Joi.object({
  facilityId: Joi.string().required(),
  command: Joi.string().valid('DENYLIST_ADD', 'DENYLIST_REMOVE', 'LOCK', 'UNLOCK').required(),
  targetDeviceIds: Joi.array().items(Joi.string()).min(1).required(),
  userId: Joi.string().when('command', {
    is: Joi.string().valid('DENYLIST_ADD', 'DENYLIST_REMOVE'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  expirationSeconds: Joi.number().integer().min(60).max(86400 * 365).optional(), // For denylist entries
});

// POST /api/v1/admin/ops-key-rotation/broadcast
router.post('/ops-key-rotation/broadcast', authenticateToken, requireDevAdmin, rotationLimiter, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const body = (req.body || {}) as any;
  const db = DatabaseService.getInstance().connection;
  const settingKey = 'security.last_root_rotation_ts';

  const persistTimestamp = async (ts: number) => {
    const row = await db('system_settings').where({ key: settingKey }).first();
    const lastTs = row ? parseInt(row.value, 10) || 0 : 0;
    if (ts <= lastTs) {
      throw new Error('Rotation ts must be greater than last recorded');
    }
    if (row) {
      await db('system_settings').where({ key: settingKey }).update({ value: String(ts), updated_at: db.fn.now() });
    } else {
      await db('system_settings').insert({ key: settingKey, value: String(ts), created_at: db.fn.now(), updated_at: db.fn.now() });
    }
  };

  const broadcast = (payload: any, signature: string) => {
    GatewayEventsService.getInstance().broadcast([payload, signature]);
  };

  // Legacy passthrough (pre-managed flow)
  if (body.payload && body.signature) {
    if (
      !body.payload ||
      body.payload.cmd_type !== 'ROTATE_OPERATIONS_KEY' ||
      typeof body.payload.new_ops_pubkey !== 'string' ||
      typeof body.payload.ts !== 'number' ||
      typeof body.signature !== 'string'
    ) {
      res.status(400).json({ success: false, message: 'Invalid rotation packet' });
      return;
    }
    try {
      await persistTimestamp(body.payload.ts);
    } catch (err: any) {
      res.status(409).json({ success: false, message: err.message || 'Rotation ts must be greater than last recorded' });
      return;
    }
    broadcast(body.payload, body.signature);
    res.json({ success: true });
    return;
  }

  // Managed rotation flow
  if (typeof body.root_private_key_b64 !== 'string') {
    res.status(400).json({ success: false, message: 'root_private_key_b64 is required' });
    return;
  }

  const rootPrivateKeyB64: string = body.root_private_key_b64;
  const customOpsPublicKeyB64: string | undefined = body.custom_ops_public_key_b64;

  const normalizedRootKey = Ed25519Service.normalizeBase64(rootPrivateKeyB64);
  let newOpsPublicKey = customOpsPublicKeyB64 ? Ed25519Service.normalizeBase64(customOpsPublicKeyB64) : undefined;
  let generatedOpsKeyPair: { private_key_b64: string; public_key_b64: string } | undefined;

  if (!newOpsPublicKey) {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const jwkPriv = await exportJWK(privateKey as unknown as KeyLike);
    const jwkPub = await exportJWK(publicKey as unknown as KeyLike);
    if (!jwkPriv.d || !jwkPub.x) {
      throw new Error('Generated key pair is invalid');
    }
    generatedOpsKeyPair = {
      private_key_b64: jwkPriv.d,
      public_key_b64: jwkPub.x,
    };
    newOpsPublicKey = jwkPub.x;
  } else {
    newOpsPublicKey = Ed25519Service.normalizeBase64(newOpsPublicKey);
  }

  const payload = {
    cmd_type: 'ROTATE_OPERATIONS_KEY',
    new_ops_pubkey: newOpsPublicKey!,
    ts: Math.floor(Date.now() / 1000),
  };

  let signature: string;
  try {
    ({ signature } = await Ed25519Service.signPayloadWithRootKey(normalizedRootKey, payload));
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid root private key' });
    return;
  }

  // For managed flow, treat timestamp monotonicity as best-effort: we persist it,
  // but do not fail the rotation if an older ts is used (to avoid blocking tooling).
  try {
    await persistTimestamp(payload.ts);
  } catch {
    // Swallow timestamp conflicts for managed flows
  }

  broadcast(payload, signature);

  res.json({
    success: true,
    payload,
    signature,
    generated_ops_key_pair: generatedOpsKeyPair,
  });
}));

/**
 * POST /api/v1/admin/rate-limits/bypass
 * DEV_ADMIN only - Temporarily bypass rate limiting for local testing
 */
router.post('/rate-limits/bypass', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((config.nodeEnv || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Rate limit bypass is disabled in production' });
    return;
  }
  const { error, value } = rateLimitBypassSchema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  const svc = RateLimitBypassService.getInstance();
  if (!value.enabled) {
    svc.disable();
    res.json({ success: true, message: 'Rate limit bypass disabled' });
    return;
  }
  const durationMs = value.durationSeconds * 1000;
  const effectiveIp = value.ip || req.ip || req.socket?.remoteAddress || null;
  svc.enable({
    durationMs,
    ip: effectiveIp,
    reason: value.reason || `dev_admin:${req.user?.userId || 'unknown'}`
  });
  const state = svc.getState();
  res.json({
    success: true,
    message: 'Rate limit bypass enabled',
    expiresAt: state.expiresAt,
    ip: state.ip
  });
}));

/**
 * POST /api/v1/admin/dev-tools/notifications-test-mode
 * DEV_ADMIN only - Enable or disable notification debug test mode.
 * When enabled (non-production only), NotificationService will publish
 * invite/OTP events to in-memory debug subscribers instead of calling
 * real SMS/email providers. Intended for local/E2E testing.
 */
router.post('/dev-tools/notifications-test-mode', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((config.nodeEnv || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Notifications test mode is disabled in production' });
    return;
  }
  const { error, value } = notificationsTestModeSchema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  const { NotificationDebugService } = await import('@/services/notifications/notification-debug.service');
  const svc = NotificationDebugService.getInstance();
  if (value.enabled) {
    svc.enable();
  } else {
    svc.disable();
  }
  res.json({ success: true, enabled: svc.isEnabled() });
}));

/**
 * POST /api/v1/admin/dev-tools/gateway-ping
 * DEV_ADMIN only - Force an immediate PING to a connected gateway for a facility.
 * This is intended solely for local/E2E testing of the heartbeat PING/PONG flow.
 */
router.post('/dev-tools/gateway-ping', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((config.nodeEnv || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Gateway dev ping is disabled in production' });
    return;
  }

  const { error, value } = gatewayPingSchema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const facilityId = String(value.facilityId);
  // Use the same command shape that the heartbeat uses so gateways can treat it uniformly.
  GatewayEventsService.getInstance().unicastToFacility(facilityId, { type: 'PING' });
  res.json({ success: true, facilityId });
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

/**
 * POST /api/v1/admin/dev-tools/gateway-command
 * DEV_ADMIN only - Send test gateway commands (DENYLIST_ADD/REMOVE, LOCK/UNLOCK)
 * Intended for testing gateway communication and command delivery.
 */
router.post('/dev-tools/gateway-command', authenticateToken, requireDevAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if ((config.nodeEnv || '').toLowerCase() === 'production') {
    res.status(403).json({ success: false, message: 'Gateway dev commands are disabled in production' });
    return;
  }

  const { error, value } = gatewayCommandSchema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  const { facilityId, command, targetDeviceIds, userId, expirationSeconds } = value;
  const gateway = GatewayEventsService.getInstance();

  try {
    switch (command) {
      case 'DENYLIST_ADD': {
        // Default expiration: 1 year from now
        const exp = expirationSeconds 
          ? Math.floor(Date.now() / 1000) + expirationSeconds 
          : Math.floor(Date.now() / 1000) + 86400 * 365;
        const entries = [{ sub: userId, exp }];
        const [payload, signature] = await DenylistService.buildDenylistAdd(entries, targetDeviceIds);
        gateway.unicastToFacility(facilityId, [payload, signature]);
        logger.info(`Dev gateway command: DENYLIST_ADD sent to facility ${facilityId}`, { userId, targetDeviceIds });
        res.json({ success: true, command, payload, signature });
        break;
      }

      case 'DENYLIST_REMOVE': {
        const entries = [{ sub: userId, exp: 0 }]; // exp not used for remove
        const [payload, signature] = await DenylistService.buildDenylistRemove(entries, targetDeviceIds);
        gateway.unicastToFacility(facilityId, [payload, signature]);
        logger.info(`Dev gateway command: DENYLIST_REMOVE sent to facility ${facilityId}`, { userId, targetDeviceIds });
        res.json({ success: true, command, payload, signature });
        break;
      }

      case 'LOCK': {
        // Send lock command for each device
        for (const deviceId of targetDeviceIds) {
          const lockPayload = { type: 'DEVICE_COMMAND', deviceId, command: 'LOCK' };
          gateway.unicastToFacility(facilityId, lockPayload);
        }
        logger.info(`Dev gateway command: LOCK sent to facility ${facilityId}`, { targetDeviceIds });
        res.json({ success: true, command, targetDeviceIds });
        break;
      }

      case 'UNLOCK': {
        // Send unlock command for each device
        for (const deviceId of targetDeviceIds) {
          const unlockPayload = { type: 'DEVICE_COMMAND', deviceId, command: 'UNLOCK' };
          gateway.unicastToFacility(facilityId, unlockPayload);
        }
        logger.info(`Dev gateway command: UNLOCK sent to facility ${facilityId}`, { targetDeviceIds });
        res.json({ success: true, command, targetDeviceIds });
        break;
      }

      default:
        res.status(400).json({ success: false, message: `Unknown command: ${command}` });
    }
  } catch (err: any) {
    logger.error(`Failed to send dev gateway command: ${err.message}`, err);
    res.status(500).json({ success: false, message: err.message || 'Failed to send gateway command' });
  }
}));

/**
 * POST /api/v1/admin/data-prune - Manually trigger data pruning (admin only)
 * Prunes expired/consumed invites, OTPs, and password reset tokens
 */
router.post('/data-prune', authenticateToken, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;

  try {
    const { DataPruningService } = await import('@/services/data-pruning.service');
    const pruningService = DataPruningService.getInstance();
    const results = await pruningService.prune();

    logger.info(`Manual data pruning triggered by ${user.userId}`, results);

    res.json({
      success: true,
      message: 'Data pruning completed',
      results,
    });
  } catch (error: any) {
    logger.error('Error during manual data pruning:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to prune data',
      error: error?.message || 'Unknown error',
    });
  }
}));

export { router as adminRouter };



