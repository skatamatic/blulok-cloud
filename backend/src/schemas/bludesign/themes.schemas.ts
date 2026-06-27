import Joi from 'joi';

export const partMaterialSchema = Joi.object({
  color: Joi.string().required(),
  metalness: Joi.number().min(0).max(1).required(),
  roughness: Joi.number().min(0).max(1).required(),
  emissive: Joi.string().optional(),
  emissiveIntensity: Joi.number().optional(),
  transparent: Joi.boolean().optional(),
  opacity: Joi.number().min(0).max(1).optional(),
  textureUrl: Joi.string().uri().optional(),
  normalMapUrl: Joi.string().uri().optional(),
  roughnessMapUrl: Joi.string().uri().optional(),
  shaderHint: Joi.string().valid('wireframe', 'glass-paned', 'default').optional(),
});

const environmentSchema = Joi.object({
  grass: partMaterialSchema.required(),
  pavement: partMaterialSchema.required(),
  gravel: partMaterialSchema.required(),
});

export const createThemeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  categorySkins: Joi.object().pattern(Joi.string(), Joi.string().allow(null)).optional(),
  buildingSkin: Joi.string().valid('DEFAULT', 'BRICK', 'GLASS', 'CONCRETE', 'METAL').optional(),
  buildingSkinId: Joi.string().optional(),
  environment: environmentSchema.optional(),
});

export const updateThemeSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  categorySkins: Joi.object().pattern(Joi.string(), Joi.string().allow(null)).optional(),
  buildingSkin: Joi.string().valid('DEFAULT', 'BRICK', 'GLASS', 'CONCRETE', 'METAL').optional(),
  buildingSkinId: Joi.string().optional(),
  environment: environmentSchema.optional(),
});

export const themeIdParamSchema = Joi.object({
  id: Joi.string().required(),
});
