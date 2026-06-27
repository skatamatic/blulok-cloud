import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

export const facilityUnitsParamSchema = Joi.object({
  facilityId: routeIdField(),
});

export const unitsListQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
  facilityId: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
  sortBy: Joi.string().optional(),
  sort_by: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
  search: Joi.string().optional(),
  status: Joi.string().optional(),
  lock_status: Joi.string().optional(),
});

export const unitsListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  units: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
});
