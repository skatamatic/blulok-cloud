import Joi from 'joi';
import { routeIdField, coercibleLimitQuery, coercibleOffsetQuery } from '@/openapi/common-schemas';
import { AssetCategory, GeometryType } from '@/bludesign/types/bludesign.types';
import {
  assetDefinitionSchema,
  materialPresetSchema,
  updateAssetDefinitionSchema,
  updateMaterialPresetSchema,
} from './asset-definitions.schemas';

export {
  assetDefinitionSchema,
  materialPresetSchema,
  updateAssetDefinitionSchema,
  updateMaterialPresetSchema,
};

export const createAssetSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  category: Joi.string().valid(...Object.values(AssetCategory)).required(),
  geometry: Joi.object({
    type: Joi.string().valid(...Object.values(GeometryType)).required(),
    source: Joi.string().optional(),
    primitiveSpec: Joi.object().optional(),
  }).required(),
  materials: Joi.object({
    slots: Joi.object().pattern(Joi.string(), Joi.object({
      name: Joi.string().required(),
      defaultColor: Joi.string().required(),
      defaultTexture: Joi.string().optional(),
      metalness: Joi.number().min(0).max(1).optional(),
      roughness: Joi.number().min(0).max(1).optional(),
      emissive: Joi.string().optional(),
      emissiveIntensity: Joi.number().optional(),
      allowBrandingOverride: Joi.boolean().required(),
    })).required(),
    brandingOverrides: Joi.array().optional(),
  }).optional(),
  isSmart: Joi.boolean().optional(),
  binding: Joi.object({
    entityType: Joi.string().required(),
    dataShape: Joi.object().pattern(Joi.string(), Joi.string().valid('string', 'number', 'boolean', 'object')).required(),
    stateMappings: Joi.array().items(Joi.object({
      condition: Joi.object({
        field: Joi.string().required(),
        operator: Joi.string().valid('==', '!=', '>', '<', '>=', '<=').required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).required(),
      }).required(),
      resultState: Joi.string().required(),
      priority: Joi.number().required(),
    })).required(),
    defaultState: Joi.string().required(),
  }).optional(),
  metadata: Joi.object({
    description: Joi.string().optional(),
    thumbnail: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    author: Joi.string().optional(),
    license: Joi.string().optional(),
    dimensions: Joi.object({
      width: Joi.number().required(),
      height: Joi.number().required(),
      depth: Joi.number().required(),
    }).required(),
    gridUnits: Joi.object({
      x: Joi.number().required(),
      z: Joi.number().required(),
    }).required(),
    canRotate: Joi.boolean().required(),
    canStack: Joi.boolean().required(),
  }).required(),
});

export const updateAssetSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  geometry: Joi.object({
    type: Joi.string().valid(...Object.values(GeometryType)).required(),
    source: Joi.string().optional(),
    primitiveSpec: Joi.object().optional(),
  }).optional(),
  materials: Joi.object().optional(),
  binding: Joi.object().optional(),
  metadata: Joi.object().optional(),
}).min(1);

export const projectAssetParamSchema = Joi.object({
  projectId: routeIdField(),
});

export const projectAssetIdParamSchema = Joi.object({
  projectId: routeIdField(),
  assetId: routeIdField(),
});

export const projectAssetDownloadParamSchema = Joi.object({
  projectId: routeIdField(),
  assetId: routeIdField(),
  filename: Joi.string().required(),
});

export const projectAssetDefinitionIdParamSchema = Joi.object({
  projectId: routeIdField(),
  id: routeIdField(),
});

export const projectAssetDefinitionAssetIdParamSchema = Joi.object({
  projectId: routeIdField(),
  assetId: routeIdField(),
});

export const projectMaterialPresetParamSchema = Joi.object({
  projectId: routeIdField(),
  assetId: routeIdField(),
  presetId: routeIdField(),
});

export const bluDesignProjectAssetListQuerySchema = Joi.object({
  category: Joi.string().valid(...Object.values(AssetCategory)).optional(),
  isSmart: Joi.boolean().optional(),
  search: Joi.string().max(255).optional(),
  limit: coercibleLimitQuery(),
  offset: coercibleOffsetQuery(),
});
