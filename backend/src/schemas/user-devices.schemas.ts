import Joi from 'joi';

export const registerDeviceSchema = Joi.object({
  app_device_id: Joi.string().max(128).required(),
  platform: Joi.string().valid('ios', 'android', 'web', 'other').required(),
  device_name: Joi.string().max(255).allow('', null),
  public_key: Joi.string().base64({ paddingRequired: true }).required(),
});

export const rotateDeviceKeySchema = Joi.object({
  public_key: Joi.string().base64({ paddingRequired: true }).required(),
});

export const deviceIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

export const userDevicesListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  devices: Joi.array().items(Joi.object()).required(),
});

export const userDeviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  device: Joi.object().required(),
});

export const userDeviceSuccessResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
});

export const adminDeleteDeviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});
