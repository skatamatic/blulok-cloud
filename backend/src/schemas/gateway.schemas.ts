import Joi from 'joi';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const gatewayFacilityIdParamSchema = Joi.object({
  facilityId: routeIdField(),
});

export const gatewayIdParamSchema = Joi.object({
  gatewayId: routeIdField(),
});

export const gatewayRecoveryIdParamSchema = Joi.object({
  gatewayId: routeIdField(),
  recoveryId: routeIdField(),
});

export const gatewayResourceIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const gatewayListQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

export const gatewayRecoveryInitiateSchema = Joi.object({
  firmwareId: Joi.string().uuid().optional(),
  includeFirmware: Joi.boolean().optional(),
});

export const gatewayRecoveryBypassSchema = Joi.object({
  confirm: Joi.boolean().required(),
});

export const gatewayStatusUpdateSchema = Joi.object({
  status: Joi.string().required(),
});

export const gatewayTelemetryLogsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).optional(),
  offset: Joi.number().integer().min(0).optional(),
  payload_path: Joi.string().optional(),
  payload_value: Joi.string().optional(),
  from: Joi.string().optional(),
  to: Joi.string().optional(),
  payload_op: Joi.string().valid('eq', 'contains').optional(),
  search: Joi.string().optional(),
  source: Joi.string().valid('gateway_ws', 'cloud_system').optional(),
});

export const gatewaySyncLogsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

export const gatewayRecoveryEventsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).optional(),
});

export const gatewayResponseSchema = successEnvelopeSchema.unknown(true);
