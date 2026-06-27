import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

const timeWindowSchema = Joi.object({
  day_of_week: Joi.number().integer().min(0).max(6).required(),
  start_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
  end_time: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).required(),
}).unknown(false);

export const createScheduleSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  schedule_type: Joi.string().valid('precanned', 'custom').required(),
  is_active: Joi.boolean().optional(),
  time_windows: Joi.array().items(timeWindowSchema).optional().default([]),
});

export const updateScheduleSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  is_active: Joi.boolean().optional(),
  time_windows: Joi.array().items(timeWindowSchema).optional(),
});

export const scheduleFacilityIdParamSchema = Joi.object({
  facilityId: routeIdField(),
});

export const scheduleIdParamSchema = Joi.object({
  facilityId: routeIdField(),
  scheduleId: routeIdField(),
});

export const userScheduleParamSchema = Joi.object({
  userId: routeIdField(),
  facilityId: routeIdField(),
});

export const setUserScheduleSchema = Joi.object({
  scheduleId: Joi.string().uuid().required(),
});

export const schedulesResponseSchema = successEnvelopeSchema.unknown(true);
