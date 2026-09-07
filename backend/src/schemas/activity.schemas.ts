import Joi from 'joi';
import { strictUuidField } from '@/openapi/common-schemas';

export const activityListQuerySchema = Joi.object({
  entityType: Joi.string().valid('unit', 'device', 'facility', 'user', 'gateway').optional(),
  entityId: Joi.string().uuid().optional(),
  activityType: Joi.string()
    .valid(
      'lock',
      'unlock',
      'locking',
      'unlocking',
      'access_attempt',
      'status_change',
      'error',
      'maintenance_start',
      'maintenance_end',
      'assignment_change',
      'configuration_change',
      'connection_change',
      'general',
    )
    .optional(),
  actorType: Joi.string().valid('user', 'system', 'device', 'gateway').optional(),
  actorId: Joi.string().uuid().optional(),
  result: Joi.string().valid('success', 'failure', 'pending', 'unknown').optional(),
  facilityId: Joi.string().uuid().optional(),
  unitId: Joi.string().uuid().optional(),
  deviceId: Joi.string().uuid().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const facilityActivityQuerySchema = Joi.object({
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const activityPaginationQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const activityFacilityIdParamSchema = Joi.object({
  facilityId: strictUuidField(),
});

export const activityUnitIdParamSchema = Joi.object({
  unitId: strictUuidField(),
});

export const activityDeviceIdParamSchema = Joi.object({
  deviceId: strictUuidField(),
});

export const activityListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  activities: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
  limit: Joi.number().integer().required(),
  offset: Joi.number().integer().required(),
});
