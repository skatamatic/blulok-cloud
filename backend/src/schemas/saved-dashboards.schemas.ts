import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

export const createSavedDashboardSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
});

export const updateSavedDashboardSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
}).min(1);

export const savedDashboardIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const loadSavedDashboardSchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const savedDashboardListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  dashboards: Joi.array().items(Joi.object()).required(),
});

export const savedDashboardCreateResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  dashboard: Joi.object().required(),
});

export const savedDashboardSnapshotResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
  dashboard: Joi.object().required(),
});

export const savedDashboardUpdateResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  dashboard: Joi.object().required(),
});

export const savedDashboardDeleteResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});

export const savedDashboardLoadResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
}).unknown(true);
