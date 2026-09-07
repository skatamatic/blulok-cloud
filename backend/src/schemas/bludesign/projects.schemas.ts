import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

const defaultBrandingSchema = Joi.object({
  primaryColor: Joi.string().required(),
  secondaryColor: Joi.string().required(),
  logoUrl: Joi.string().uri().optional(),
  overrides: Joi.array().items(Joi.object({
    slotName: Joi.string().required(),
    color: Joi.string().optional(),
    textureUrl: Joi.string().uri().optional(),
  })).optional(),
});

export const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(2000).optional(),
  storageProvider: Joi.string().valid('local', 'gcs', 'gdrive').optional(),
  storageConfig: Joi.object().optional(),
  defaultBranding: defaultBrandingSchema.optional(),
});

export const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(2000).allow(null).optional(),
  storageProvider: Joi.string().valid('local', 'gcs', 'gdrive').optional(),
  storageConfig: Joi.object().optional(),
  defaultBranding: defaultBrandingSchema.optional(),
}).min(1);

export const projectIdParamSchema = Joi.object({
  id: routeIdField(),
});
