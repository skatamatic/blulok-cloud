import Joi from 'joi';
import {
  successEnvelopeSchema,
  routeIdField,
  routeIdFieldOptional,
  coercibleLimitQuery,
  coercibleOffsetQuery,
} from '@/openapi/common-schemas';

export const accessSessionsQuerySchema = Joi.object({
  facility_id: routeIdFieldOptional(),
  unit_id: routeIdFieldOptional(),
  user_id: routeIdFieldOptional(),
  device_id: routeIdFieldOptional(),
  action: Joi.string().optional(),
  action_type: Joi.string().optional(),
  method: Joi.string().optional(),
  denial_reason: Joi.string().optional(),
  state: Joi.string()
    .valid('pending', 'open', 'closed', 'timed_out', 'denied', 'failed')
    .optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  success: Joi.boolean().optional(),
  limit: coercibleLimitQuery(),
  offset: coercibleOffsetQuery(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
});

export const accessSessionsIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const accessSessionsExportQuerySchema = accessSessionsQuerySchema.keys({
  limit: coercibleLimitQuery(),
});

export const accessSessionsResponseSchema = successEnvelopeSchema.unknown(true);
