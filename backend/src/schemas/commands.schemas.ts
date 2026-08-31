import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const commandsPendingQuerySchema = Joi.object({
  status: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const commandIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const commandsResponseSchema = successEnvelopeSchema.unknown(true);
