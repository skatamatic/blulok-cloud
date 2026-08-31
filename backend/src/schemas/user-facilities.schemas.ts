import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const setUserFacilitiesSchema = Joi.object({
  facilityIds: Joi.array().items(Joi.string().min(1)).required(),
});

export const userFacilitiesUserIdParamSchema = Joi.object({
  userId: routeIdField(),
});

export const userFacilitiesAssociationParamSchema = Joi.object({
  userId: routeIdField(),
  facilityId: routeIdField(),
});

export const userFacilitiesResponseSchema = successEnvelopeSchema.unknown(true);
