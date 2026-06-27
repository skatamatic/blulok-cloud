import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';
import {
  MAX_LOCK_COMMAND_TIMEOUT_SEC,
  MIN_LOCK_COMMAND_TIMEOUT_SEC,
} from '@/constants/lock-command.constants';

export const facilitiesListQuerySchema = Joi.object({
  search: Joi.string().optional(),
  status: Joi.string().optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).optional(),
  offset: Joi.number().integer().min(0).optional(),
  user_id: Joi.string().uuid().optional(),
});

export const facilityIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const createFacilitySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().allow('').max(2000).optional(),
  address: Joi.string().trim().min(1).max(500).required(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  branding_image: Joi.string().allow('').optional(),
  image_mime_type: Joi.string().allow('').max(100).optional(),
  contact_email: Joi.string().email().allow('').optional(),
  contact_phone: Joi.string().allow('').max(50).optional(),
  status: Joi.string().valid('active', 'inactive', 'maintenance').optional(),
  lock_command_timeout_sec: Joi.number()
    .integer()
    .min(MIN_LOCK_COMMAND_TIMEOUT_SEC)
    .max(MAX_LOCK_COMMAND_TIMEOUT_SEC)
    .optional(),
  metadata: Joi.object().optional(),
  city: Joi.string().max(255).optional(),
  state: Joi.string().max(50).optional(),
  zip_code: Joi.string().max(20).optional(),
}).unknown(true);

export const updateFacilitySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().allow('').max(2000).optional(),
  address: Joi.string().trim().min(1).max(500).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  branding_image: Joi.string().allow('').optional(),
  image_mime_type: Joi.string().allow('').max(100).optional(),
  contact_email: Joi.string().email().allow('').optional(),
  contact_phone: Joi.string().allow('').max(50).optional(),
  status: Joi.string().valid('active', 'inactive', 'maintenance').optional(),
  lock_command_timeout_sec: Joi.number()
    .integer()
    .min(MIN_LOCK_COMMAND_TIMEOUT_SEC)
    .max(MAX_LOCK_COMMAND_TIMEOUT_SEC)
    .optional(),
  metadata: Joi.object().optional(),
  city: Joi.string().max(255).optional(),
  state: Joi.string().max(50).optional(),
  zip_code: Joi.string().max(20).optional(),
}).min(1).unknown(true);

export const facilitiesListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).optional(),
  facilities: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
});

export const facilityDetailResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  facility: Joi.object().required(),
  deviceHierarchy: Joi.object().required(),
});

export const facilityMutationResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  facility: Joi.object().required(),
});

export const facilityDeleteImpactResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
}).unknown(true);

export const facilityDeleteResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});
