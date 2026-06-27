import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

export const facilityDataSchema = Joi.object({
  version: Joi.string().required(),
  camera: Joi.object().required(),
  placedObjects: Joi.array().required(),
  gridSize: Joi.number().required(),
  showGrid: Joi.boolean().required(),
}).unknown(true);

export const saveFacilitySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  data: facilityDataSchema.required(),
  thumbnail: Joi.string().optional().allow(null, ''),
  copyLayoutSourceFrom: Joi.string().uuid().optional(),
  copyTerrainFrom: Joi.string().uuid().optional(),
});

export const updateFacilitySchema = Joi.object({
  data: facilityDataSchema.required(),
  thumbnail: Joi.string().optional().allow(null, ''),
});

export const facilityIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const terrainDataIdParamSchema = Joi.object({
  terrainDataId: Joi.string().required(),
});
