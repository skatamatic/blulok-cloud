import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const deviceGroupCreateSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  group_type: Joi.string().valid('zone', 'access_code').default('zone'),
  is_global_shared: Joi.boolean().default(false),
  name: Joi.string().max(255).required(),
  description: Joi.string().allow('', null).optional(),
  settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
});

export const deviceGroupUpdateSchema = Joi.object({
  group_type: Joi.string().valid('zone', 'access_code').optional(),
  is_global_shared: Joi.boolean().optional(),
  name: Joi.string().max(255).optional(),
  description: Joi.string().allow('', null).optional(),
  settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const deviceGroupAddMemberSchema = Joi.object({
  device_id: Joi.string().uuid().optional(),
  unit_id: Joi.string().uuid().optional(),
  device_type: Joi.string().valid('access_control', 'blulok').default('access_control'),
}).or('device_id', 'unit_id');

export const deviceGroupRemoveMemberQuerySchema = Joi.object({
  device_type: Joi.string().valid('access_control', 'blulok').optional(),
});

export const deviceGroupListQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  group_type: Joi.string().valid('zone', 'access_code').optional(),
});

export const deviceGroupIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const deviceGroupMemberParamSchema = Joi.object({
  id: routeIdField(),
  deviceId: routeIdField(),
});

export const deviceGroupResponseSchema = successEnvelopeSchema.unknown(true);
