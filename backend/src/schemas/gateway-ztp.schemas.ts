import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

export const gatewayClaimBodySchema = Joi.object({
  facility_id: routeIdField().required(),
  device_id: routeIdField().required(),
  public_key: Joi.string().min(40).max(128).required(),
  name: Joi.string().min(1).max(255).optional(),
});
