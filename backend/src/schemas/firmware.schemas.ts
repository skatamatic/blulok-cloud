import Joi from 'joi';
import { FIRMWARE_MAX_SIZE_BYTES } from '@/services/firmware/firmware-storage.factory';
import { successEnvelopeSchema, routeIdField, coercibleLimitQuery, coercibleOffsetQuery } from '@/openapi/common-schemas';

const VALID_TARGET_TYPES = ['gateway', 'lock', 'friend_node', 'bridge', 'access_control'] as const;

export const firmwareUploadSchema = Joi.object({
  version: Joi.string().max(64).required(),
  target_type: Joi.string().valid(...VALID_TARGET_TYPES).optional().default('gateway'),
  description: Joi.string().max(2000).optional().allow(''),
  release_notes: Joi.string().max(10000).optional().allow(''),
  compatible_models: Joi.string().optional().allow(''),
  minimum_version: Joi.string().max(64).optional().allow(''),
});

export const firmwareInitUploadSchema = firmwareUploadSchema.keys({
  phase: Joi.string().valid('prepare').required(),
  filename: Joi.string().max(255).required(),
  size_bytes: Joi.number().integer().min(1).max(FIRMWARE_MAX_SIZE_BYTES).required(),
});

export const firmwareCompleteUploadSchema = firmwareInitUploadSchema.keys({
  phase: Joi.string().valid('finalize').required(),
  upload_id: Joi.string().uuid().required(),
});

export const firmwareListQuerySchema = Joi.object({
  target_type: Joi.string().valid(...VALID_TARGET_TYPES).optional(),
});

export const firmwarePushStatusQuerySchema = Joi.object({
  target_type: Joi.string().valid(...VALID_TARGET_TYPES).optional(),
  include_events: Joi.string().valid('true', 'false').optional(),
});

export const firmwarePushHistoryQuerySchema = Joi.object({
  target_type: Joi.string().valid(...VALID_TARGET_TYPES).optional(),
  limit: coercibleLimitQuery(),
  offset: coercibleOffsetQuery(),
});

export const firmwarePushEventsQuerySchema = Joi.object({
  limit: coercibleLimitQuery(),
  offset: coercibleOffsetQuery(),
  event_type: Joi.string().valid('progress', 'device_status', 'error', 'info').optional(),
});

export const firmwareIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const firmwareGatewayIdParamSchema = Joi.object({
  gatewayId: routeIdField(),
});

export const firmwarePushIdParamSchema = Joi.object({
  pushId: routeIdField(),
});

export const firmwarePushGatewayParamSchema = Joi.object({
  id: routeIdField(),
  gatewayId: routeIdField(),
});

export const firmwarePushBodySchema = Joi.object({
  delivery_mode: Joi.string().valid('v1', 'v2').optional(),
});

export const firmwareResponseSchema = successEnvelopeSchema.unknown(true);
