import Joi from 'joi';
import { routeIdBodyField } from '@/openapi/common-schemas';

export const devLogsQuerySchema = Joi.object({
  type: Joi.string().valid('all', 'combined', 'error', 'app', 'access').default('all'),
  lines: Joi.string().optional(),
});

/** Mint a mobile-session JWT for an existing user (gateway simulator only). */
export const simulatorUserSessionSchema = Joi.object({
  userId: routeIdBodyField(),
});

/** Temporarily override gateway offline grace for this process (e2e / local speed-up). */
export const gatewayOfflineGraceBodySchema = Joi.object({
  /** Milliseconds; `null` clears the override and restores env/default. */
  grace_ms: Joi.number().integer().min(0).max(120_000).allow(null).required(),
});

/**
 * Temporarily override firmware OTA reconnect grace timeouts for this process.
 * At least one field required; `null` clears that override.
 */
export const firmwareTimeoutsBodySchema = Joi.object({
  transfer_disconnect_grace_ms: Joi.number().integer().min(100).max(600_000).allow(null).optional(),
  verify_disconnect_grace_ms: Joi.number().integer().min(100).max(600_000).allow(null).optional(),
}).or('transfer_disconnect_grace_ms', 'verify_disconnect_grace_ms');
