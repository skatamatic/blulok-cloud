import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';
import { AssetCategory } from '@/bludesign/types/bludesign.types';

const materialConfigSchema = Joi.object({
  color: Joi.string().optional(),
  metalness: Joi.number().min(0).max(1).optional(),
  roughness: Joi.number().min(0).max(1).optional(),
  emissive: Joi.string().optional(),
  emissiveIntensity: Joi.number().min(0).optional(),
  transparent: Joi.boolean().optional(),
  opacity: Joi.number().min(0).max(1).optional(),
});

export const assetDefinitionSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  category: Joi.string().valid(...Object.values(AssetCategory)).required(),
  modelType: Joi.string().valid('primitive', 'gltf', 'glb', 'custom').required(),
  customModelId: Joi.string().uuid().optional(),
  globalModelId: Joi.string().uuid().optional(),
  primitiveSpec: Joi.object({
    type: Joi.string().valid('box', 'cylinder', 'plane', 'custom').required(),
    params: Joi.object().optional(),
  }).optional(),
  dimensions: Joi.object({
    width: Joi.number().positive().required(),
    height: Joi.number().positive().required(),
    depth: Joi.number().positive().required(),
  }).required(),
  gridUnits: Joi.object({
    x: Joi.number().integer().positive().required(),
    z: Joi.number().integer().positive().required(),
  }).required(),
  isSmart: Joi.boolean().optional(),
  canRotate: Joi.boolean().optional(),
  canStack: Joi.boolean().optional(),
  bindingContract: Joi.object({
    entityType: Joi.string().required(),
    requiredFields: Joi.array().items(Joi.string()).required(),
    stateField: Joi.string().optional(),
    stateValues: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  defaultMaterials: Joi.object().pattern(Joi.string(), materialConfigSchema).optional(),
  lockerSpec: Joi.object({
    doorSide: Joi.string().valid('front', 'back', 'left', 'right').required(),
    doorWidth: Joi.number().positive().required(),
    doorHeight: Joi.number().positive().required(),
    doorPositionX: Joi.number().required(),
    doorPositionY: Joi.number().min(0).required(),
  }).optional(),
  positionOffset: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required(),
    z: Joi.number().required(),
  }).optional(),
  thumbnail: Joi.string().optional(),
});

export const updateAssetDefinitionSchema = assetDefinitionSchema.fork(
  ['name', 'category', 'modelType', 'dimensions', 'gridUnits'],
  (schema) => schema.optional(),
);

export const materialPresetSchema = Joi.object({
  presetName: Joi.string().min(1).max(100).required(),
  partName: Joi.string().min(1).max(100).required(),
  materialConfig: materialConfigSchema.required(),
  textureId: Joi.string().uuid().optional(),
  stateBinding: Joi.string().max(50).optional(),
  sortOrder: Joi.number().integer().min(0).optional(),
});

export const updateMaterialPresetSchema = materialPresetSchema.fork(
  ['presetName', 'partName', 'materialConfig'],
  (schema) => schema.optional(),
);

export const assetDefinitionIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const assetDefinitionAssetIdParamSchema = Joi.object({
  assetId: routeIdField(),
});

export const materialPresetParamSchema = Joi.object({
  assetId: routeIdField(),
  presetId: routeIdField(),
});

export const customModelProjectParamSchema = Joi.object({
  projectId: routeIdField(),
});

export const customModelDeleteParamSchema = Joi.object({
  projectId: routeIdField(),
  modelId: Joi.string().required(),
});

export const globalModelIdParamSchema = Joi.object({
  id: routeIdField(),
});
