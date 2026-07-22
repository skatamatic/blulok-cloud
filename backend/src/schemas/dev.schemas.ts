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
