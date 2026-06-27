import Joi from 'joi';

export const partMaterialSchema = Joi.object({
  color: Joi.string().required(),
  metalness: Joi.number().min(0).max(1).required(),
  roughness: Joi.number().min(0).max(1).required(),
  emissive: Joi.string().optional(),
  emissiveIntensity: Joi.number().optional(),
  transparent: Joi.boolean().optional(),
  opacity: Joi.number().min(0).max(1).optional(),
  textureUrl: Joi.string().uri().optional().allow(''),
  normalMapUrl: Joi.string().uri().optional().allow(''),
  roughnessMapUrl: Joi.string().uri().optional().allow(''),
  shaderHint: Joi.string().valid('wireframe', 'glass-paned', 'glass-floor', 'glass-roof', 'default').optional(),
});

export const createSkinSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  category: Joi.string().required(),
  partMaterials: Joi.object().pattern(Joi.string(), partMaterialSchema).required(),
  thumbnail: Joi.string().optional(),
});

export const updateSkinSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  partMaterials: Joi.object().pattern(Joi.string(), partMaterialSchema).optional(),
  thumbnail: Joi.string().optional(),
});

export const skinIdParamSchema = Joi.object({
  id: Joi.string().required(),
});
