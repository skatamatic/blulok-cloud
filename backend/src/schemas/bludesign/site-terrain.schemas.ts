import Joi from 'joi';

export const siteTerrainFetchSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radiusMeters: Joi.number().min(50).max(2000).default(400),
  detailLevel: Joi.string().valid('low', 'med', 'max').default('max'),
  imageryZoom: Joi.number().integer().min(10).max(19).optional(),
  elevationZoom: Joi.number().integer().min(0).max(15).optional(),
});
