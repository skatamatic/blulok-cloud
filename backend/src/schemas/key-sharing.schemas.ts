import Joi from 'joi';
import {
  successEnvelopeSchema,
  routeIdField,
  routeIdFieldOptional,
  routeIdBodyField,
} from '@/openapi/common-schemas';

export const keySharingListQuerySchema = Joi.object({
  unit_id: routeIdFieldOptional(),
  primary_tenant_id: routeIdFieldOptional(),
  shared_with_user_id: routeIdFieldOptional(),
  access_level: Joi.string().valid('full', 'limited', 'temporary', 'permanent').optional(),
  is_active: Joi.boolean().optional(),
  expires_before: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sort_by: Joi.string().default('shared_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc'),
  group_by_unit: Joi.string().optional(),
});

export const keySharingUserQuerySchema = Joi.object({
  unit_id: routeIdFieldOptional(),
  access_level: Joi.string().valid('full', 'limited', 'temporary', 'permanent').optional(),
  is_active: Joi.boolean().optional(),
  expires_before: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sort_by: Joi.string().default('shared_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc'),
});

export const keySharingUnitQuerySchema = keySharingUserQuerySchema;

export const keySharingUserIdParamSchema = Joi.object({
  userId: routeIdField(),
});

export const keySharingUnitIdParamSchema = Joi.object({
  unitId: routeIdField(),
});

export const keySharingIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const createKeySharingSchema = Joi.object({
  unit_id: routeIdBodyField(),
  shared_with_user_id: routeIdBodyField(),
  access_level: Joi.string().valid('full', 'limited', 'temporary', 'permanent').default('limited'),
  expires_at: Joi.date().iso().optional().allow(null),
  notes: Joi.string().optional().allow(null, ''),
  access_restrictions: Joi.object().optional(),
});

export const updateKeySharingSchema = Joi.object({
  access_level: Joi.string().valid('full', 'limited', 'temporary', 'permanent').optional(),
  expires_at: Joi.date().iso().optional().allow(null),
  notes: Joi.string().optional().allow(null, ''),
  access_restrictions: Joi.object().optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const keySharingInviteSchema = Joi.object({
  unit_id: routeIdBodyField(),
  phone: Joi.string().required(),
  access_level: Joi.string().valid('full', 'limited', 'temporary').default('limited'),
  expires_at: Joi.date().iso().optional().allow(null),
});

export const keySharingResponseSchema = successEnvelopeSchema.unknown(true);
