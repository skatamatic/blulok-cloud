import Joi from 'joi';

export const updateSystemSettingsBodySchema = Joi.object({
  'security.max_devices_per_user': Joi.number().integer().min(0).max(250).optional(),
  'dev.blufms_demo_enabled': Joi.boolean().optional(),
  'dev.bludesign_enabled': Joi.boolean().optional(),
}).min(1);

export const notificationsConfigBodySchema = Joi.object({
  enabledChannels: Joi.object({
    sms: Joi.boolean().allow(null).optional(),
    email: Joi.boolean().allow(null).optional(),
  }).unknown(true).optional().allow(null),
  defaultProvider: Joi.object({
    sms: Joi.string().valid('twilio', 'console').allow(null).optional(),
    email: Joi.string().valid('console').allow(null).optional(),
  }).unknown(true).optional().allow(null),
  twilio: Joi.object({
    accountSid: Joi.string().allow(null, '').optional(),
    authToken: Joi.string().allow(null, '').optional(),
    fromNumber: Joi.string().allow(null, '').optional(),
  }).unknown(true).optional().allow(null),
  templates: Joi.object({
    inviteSms: Joi.string().allow(null, '').optional(),
    inviteEmail: Joi.string().allow(null, '').optional(),
    inviteEmailSubject: Joi.string().allow(null, '').optional(),
    otpSms: Joi.string().allow(null, '').optional(),
    otpEmail: Joi.string().allow(null, '').optional(),
    otpEmailSubject: Joi.string().allow(null, '').optional(),
    passwordResetSms: Joi.string().allow(null, '').optional(),
    passwordResetEmail: Joi.string().allow(null, '').optional(),
    passwordResetEmailSubject: Joi.string().allow(null, '').optional(),
  }).unknown(true).optional().allow(null),
  deeplinkBaseUrl: Joi.string().allow(null, '').optional(),
}).unknown(true).min(1);

export const notificationsTestBodySchema = Joi.object({
  toEmail: Joi.string().allow(null, '').optional(),
  toPhone: Joi.string().allow(null, '').optional(),
  configOverride: Joi.object().unknown(true).optional(),
}).unknown(true);
