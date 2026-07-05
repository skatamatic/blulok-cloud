import Joi from 'joi';
import { FMSProviderType } from '@/types/fms.types';
import { paginationQuerySchema } from '@/openapi/common-schemas';

const FMS_PROVIDER_TYPES = Object.values(FMSProviderType);

export const createFmsConfigSchema = Joi.object({
  facility_id: Joi.string().uuid().required(),
  provider_type: Joi.string()
    .valid(...FMS_PROVIDER_TYPES)
    .required(),
  config: Joi.object().unknown(true).required(),
  is_enabled: Joi.boolean().optional(),
});

export const updateFmsConfigSchema = Joi.object({
  provider_type: Joi.string()
    .valid(...FMS_PROVIDER_TYPES)
    .optional(),
  config: Joi.object().unknown(true).optional(),
  is_enabled: Joi.boolean().optional(),
});

export const fmsConfigIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

export const fmsFacilityIdParamSchema = Joi.object({
  facilityId: Joi.string().required(),
});

export const fmsSyncLogIdParamSchema = Joi.object({
  syncLogId: Joi.string().required(),
});

export const fmsSyncHistoryQuerySchema = paginationQuerySchema.keys({
  limit: Joi.number().integer().min(1).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

export const reviewFmsChangesSchema = Joi.object({
  syncLogId: Joi.string().required(),
  changeIds: Joi.array().items(Joi.string()).required(),
  accepted: Joi.boolean().required(),
});

export const applyFmsChangesSchema = Joi.object({
  syncLogId: Joi.string().required(),
  changeIds: Joi.array().items(Joi.string()).required(),
});

export const fmsConfigListQuerySchema = paginationQuerySchema.keys({
  webhooks_only: Joi.boolean().truthy('true').falsy('false').optional(),
  is_enabled: Joi.boolean().truthy('true').falsy('false').optional(),
  provider_type: Joi.string()
    .valid(...FMS_PROVIDER_TYPES)
    .optional(),
});

export const fmsConfigResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  config: Joi.object().required(),
});

export const fmsConfigListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  configs: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        facility_id: Joi.string().required(),
        facility_name: Joi.string().allow(null).optional(),
        provider_type: Joi.string().required(),
        is_enabled: Joi.boolean().required(),
        config: Joi.object().required(),
        last_sync_at: Joi.date().allow(null).optional(),
        last_sync_status: Joi.string().allow(null).optional(),
        created_at: Joi.date().optional(),
        updated_at: Joi.date().optional(),
      }),
    )
    .required(),
});

export const fmsConfigCreateResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
  config: Joi.object().required(),
});

export const fmsConfigMutationResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});

export const fmsConnectionTestResponseSchema = Joi.object({
  success: Joi.boolean().required(),
  message: Joi.string().required(),
  connected: Joi.boolean().optional(),
  error: Joi.string().optional(),
});

export const fmsSyncResponseSchema = Joi.object({
  success: Joi.boolean().required(),
  message: Joi.string().required(),
  result: Joi.object().optional(),
});

export const fmsSyncCancelResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
  cancelled: Joi.boolean().required(),
});

export const fmsSyncHistoryResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  logs: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
});

export const fmsWebhookEventsQuerySchema = paginationQuerySchema.keys({
  limit: Joi.number().integer().min(1).max(20).optional(),
});

export const fmsWebhookEventsResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  events: Joi.array().items(Joi.object()).required(),
});

export const fmsSyncLogResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  syncLog: Joi.object().required(),
});

export const fmsPendingChangesResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  changes: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
});

export const fmsReviewChangesResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});

export const fmsApplyChangesResponseSchema = Joi.object({
  success: Joi.boolean().required(),
  message: Joi.string().required(),
  result: Joi.object().optional(),
  error: Joi.string().optional(),
});

export const fmsWebhookResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});
