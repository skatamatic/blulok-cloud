import Joi from 'joi';

export const rateLimitBypassBodySchema = Joi.object({
  enabled: Joi.boolean().required(),
  durationSeconds: Joi.number().integer().min(1).max(900)
    .when('enabled', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
  ip: Joi.string().ip({ version: ['ipv4', 'ipv6'], cidr: 'forbidden' }).optional(),
  reason: Joi.string().max(200).optional(),
});

export const notificationsTestModeBodySchema = Joi.object({
  enabled: Joi.boolean().required(),
});

export const gatewayPingBodySchema = Joi.object({
  facilityId: Joi.string().required(),
});

export const issueRoutePassBodySchema = Joi.object({
  userId: Joi.string().uuid().required(),
  appDeviceId: Joi.string().trim().min(1).optional(),
  facilityId: Joi.string().uuid().optional(),
});

export const gatewayCommandBodySchema = Joi.object({
  facilityId: Joi.string().required(),
  command: Joi.string().valid('DENYLIST_ADD', 'DENYLIST_REMOVE', 'LOCK', 'UNLOCK').required(),
  targetDeviceIds: Joi.array().items(Joi.string()).min(1).required(),
  userId: Joi.string().when('command', {
    is: Joi.string().valid('DENYLIST_ADD', 'DENYLIST_REMOVE'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  expirationSeconds: Joi.number().integer().min(60).max(86400 * 365).optional(),
});

export const deviceDeletionOutboxQuerySchema = Joi.object({
  facilityId: Joi.string().uuid().required(),
  lockId: Joi.string().trim().min(1),
  accessId: Joi.string().trim().min(1),
  relayChannel: Joi.number().integer().min(1).max(255),
}).xor('lockId', 'accessId').with('accessId', 'relayChannel');

export const adminUserIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

export const adminFacilityIdParamSchema = Joi.object({
  id: Joi.string().required(),
});
