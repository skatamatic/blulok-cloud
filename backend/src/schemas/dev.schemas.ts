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
