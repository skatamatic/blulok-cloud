import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';
import { UserRole } from '@/types/auth.types';

const USER_ROLES = Object.values(UserRole);

export const createDashboardAssignmentSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().required(),
  scope: Joi.string().valid('global', 'facility', 'user').required(),
  facilityId: Joi.string().uuid().allow(null).optional(),
  userId: Joi.string().uuid().allow(null).optional(),
  targetRole: Joi.string()
    .valid(...USER_ROLES)
    .required(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
});

export const updateDashboardAssignmentSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().optional(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
}).min(1);

export const dashboardAssignmentIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const dashboardAssignmentListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  assignments: Joi.array().items(Joi.object()).required(),
});

export const dashboardAssignmentCreateResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  assignment: Joi.object().required(),
});

export const dashboardAssignmentUpdateResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  assignment: Joi.object().required(),
});

export const dashboardAssignmentDeleteResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});
