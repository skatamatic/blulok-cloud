import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const denylistDeviceIdParamSchema = Joi.object({
  deviceId: routeIdField(),
});

export const denylistUserIdParamSchema = Joi.object({
  userId: routeIdField(),
});

export const denylistResponseSchema = successEnvelopeSchema.unknown(true);
