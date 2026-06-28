import Joi from 'joi';
import { UserRole } from '@/types/auth.types';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';
import {
  PASSWORD_COMPLEXITY_PATTERN,
} from '@/constants/password.constants';

export const CREATE_PASSWORD_PATTERN = PASSWORD_COMPLEXITY_PATTERN;

export const usersListQuerySchema = Joi.object({
  search: Joi.string().optional(),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  facility: Joi.string().optional(),
  facility_id: Joi.string().optional(),
  sortBy: Joi.string().valid('name', 'email', 'role', 'created_at').optional(),
  sort_by: Joi.string().valid('name', 'email', 'role', 'created_at').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().allow('').optional(),
  phoneNumber: Joi.string().trim().allow('').optional(),
  sendInvite: Joi.boolean().optional(),
  facilityIds: Joi.array().items(Joi.string().uuid()).optional().default([]),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  role: Joi.string().valid(...Object.values(UserRole)).required(),
});

export const updateUserSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  phoneNumber: Joi.string().trim().allow('', null).optional(),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  isActive: Joi.boolean().optional(),
});

export const userIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const usersResponseSchema = successEnvelopeSchema.unknown(true);
