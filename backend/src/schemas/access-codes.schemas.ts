import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const accessCodeConfigSchema = Joi.object({
  is_enabled: Joi.boolean().optional(),
  digit_count: Joi.number().integer().min(3).max(8).optional(),
  rotation_interval_hours: Joi.number().positive().optional(),
  rotation_hour: Joi.number().integer().min(0).max(23).optional(),
  rotation_minute: Joi.number().integer().min(0).max(59).optional(),
}).min(1);

export const accessCodeRotateSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  scope_type: Joi.string().valid('device_group', 'device').optional(),
  scope_id: Joi.string().uuid().allow(null).optional(),
  schedule_id: Joi.string().uuid().allow(null).optional(),
}).custom((value, helpers) => {
  if (!value.scope_type) return value;
  if ((value.scope_type === 'device' || value.scope_type === 'device_group') && !value.scope_id) {
    return helpers.error('any.invalid', { message: `scope_id is required for ${value.scope_type} scope` });
  }
  if (value.schedule_id && value.scope_type !== 'device_group') {
    return helpers.error('any.invalid', { message: 'schedule_id is only supported for device_group scope' });
  }
  return value;
});

export const accessCodeSetManualSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  scope_type: Joi.string().valid('device_group', 'device').required(),
  scope_id: Joi.string().uuid().allow(null).optional(),
  code: Joi.string().pattern(/^[0-9]{3,8}$/).required(),
  schedule_id: Joi.string().uuid().allow(null).optional(),
}).custom((value, helpers) => {
  if ((value.scope_type === 'device' || value.scope_type === 'device_group') && !value.scope_id) {
    return helpers.error('any.invalid', { message: `scope_id is required for ${value.scope_type} scope` });
  }
  if (value.schedule_id && value.scope_type !== 'device_group') {
    return helpers.error('any.invalid', { message: 'schedule_id is only supported for device_group scope' });
  }
  return value;
});

export const accessCodeGroupConfigSchema = accessCodeConfigSchema;

export const accessCodeFacilityIdParamSchema = Joi.object({
  facilityId: routeIdField(),
});

export const accessCodeGroupIdParamSchema = Joi.object({
  groupId: routeIdField(),
});

export const accessCodeIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const accessCodeFacilityQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  schedule_id: Joi.string().uuid().optional(),
});

export const accessCodeMyQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

export const accessCodeResponseSchema = successEnvelopeSchema.unknown(true);
