import Joi from 'joi';
import { routeIdField } from '@/openapi/common-schemas';

export const facilityIdParamSchema = Joi.object({
  facilityId: routeIdField(),
});

export const provisioningFileIdParamSchema = Joi.object({
  facilityId: routeIdField(),
  fileId: routeIdField(),
});

export const directUploadParamSchema = Joi.object({
  facilityId: routeIdField(),
  uploadId: routeIdField(),
});

export const provisioningListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

export const prepareUploadSchema = Joi.object({
  filename: Joi.string().trim().required(),
  size_bytes: Joi.number().integer().positive().required(),
  content_type: Joi.string().trim().max(255).optional(),
});

export const completeUploadSchema = Joi.object({
  upload_id: Joi.string().uuid().required(),
  filename: Joi.string().trim().required(),
  size_bytes: Joi.number().integer().positive().required(),
  content_type: Joi.string().trim().max(255).optional(),
});

export const provisioningListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  data: Joi.object().required(),
});

export const prepareUploadResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  data: Joi.object().required(),
});

export const completeUploadResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  data: Joi.object({ file: Joi.object().required() }).required(),
});

export const deleteProvisioningFileResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  deleted: Joi.boolean().required(),
});
