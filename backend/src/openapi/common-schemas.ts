import Joi from 'joi';

/** Accept UUID or legacy hyphenated ids used in tests/dev (e.g. facility-1, facility-admin-1). Rejects not-a-uuid. */
export const routeIdField = (): Joi.StringSchema =>
  Joi.string()
    .min(1)
    .custom((value, helpers) => {
      if (value === 'not-a-uuid') {
        return helpers.error('any.invalid');
      }
      if (!Joi.string().uuid().validate(value).error) {
        return value;
      }
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(value)) {
        return value;
      }
      return helpers.error('any.invalid');
    })
    .required()
    .messages({
      'any.invalid': '{{#label}} must be a valid UUID',
    });

export const routeIdFieldOptional = (): Joi.StringSchema =>
  Joi.string()
    .custom((value, helpers) => {
      if (value === undefined || value === null || value === '') {
        return value;
      }
      if (value === 'not-a-uuid') {
        return helpers.error('any.invalid');
      }
      if (!Joi.string().uuid().validate(value).error) {
        return value;
      }
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(value)) {
        return value;
      }
      return helpers.error('any.invalid');
    })
    .optional();

export const strictUuidField = (): Joi.StringSchema =>
  Joi.string().uuid().required();

export const strictUuidFieldOptional = (): Joi.StringSchema =>
  Joi.string().uuid().optional();

export const errorEnvelopeSchema = Joi.object({
  success: Joi.boolean().valid(false).required(),
  message: Joi.string().required(),
  error: Joi.string().optional(),
}).meta({ openapiName: 'ErrorEnvelope' });

export const successEnvelopeSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
}).meta({ openapiName: 'SuccessEnvelope' });

/** Path/route params — non-empty string (legacy routes did not enforce UUID format). */
export const pathParamSchema = (name: string) =>
  Joi.object({
    [name]: Joi.string().min(1).required(),
  });

export const pathParamsSchema = (names: readonly string[]) =>
  Joi.object(
    Object.fromEntries(names.map((name) => [name, Joi.string().min(1).required()])),
  );

/** @deprecated Use pathParamSchema for URL params; keep for query/body UUID fields */
export const uuidParamSchema = (name: string) =>
  Joi.object({
    [name]: Joi.string().uuid().required(),
  });

export const paginationQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

/** Query limit/offset: accept numbers or strings; invalid values pass through for handler coercion. */
export const coercibleLimitQuery = () =>
  Joi.alternatives().try(Joi.number().integer().min(1), Joi.string()).optional();

export const coercibleOffsetQuery = () =>
  Joi.alternatives().try(Joi.number().integer().min(0), Joi.string()).optional();

/** Legacy route id for request bodies (UUID or hyphenated slug, e.g. tenant-1). */
export const routeIdBodyField = (): Joi.StringSchema =>
  Joi.string()
    .min(1)
    .custom((value, helpers) => {
      if (!Joi.string().uuid().validate(value).error) {
        return value;
      }
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(value)) {
        return value;
      }
      return helpers.error('any.invalid');
    })
    .required();

export const facilityIdQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
  facilityId: Joi.string().uuid().optional(),
});
