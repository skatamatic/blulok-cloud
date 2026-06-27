import Joi from 'joi';
import { strictUuidField } from '@/openapi/common-schemas';

export const listDevicesQuerySchema = Joi.object({
  deviceType: Joi.string().valid('door', 'gate', 'elevator').optional(),
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional(),
  search: Joi.string().max(200).optional(),
  sortBy: Joi.string().valid('name', 'device_type', 'status', 'last_activity').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const facilityIdParamSchema = Joi.object({
  facilityId: strictUuidField(),
});

export const deviceIdParamSchema = Joi.object({
  deviceId: strictUuidField(),
});

export const accessControlDevicesResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  devices: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
  limit: Joi.number().integer().required(),
  offset: Joi.number().integer().required(),
});

export const accessControlSummaryResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
}).unknown(true);

export const accessControlDeviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  device: Joi.object().required(),
});
