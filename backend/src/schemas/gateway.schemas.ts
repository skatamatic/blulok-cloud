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

export const gatewayUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  model: Joi.string().trim().max(100).allow('').optional(),
  firmware_version: Joi.string().trim().max(128).allow('').optional(),
  ip_address: Joi.string().ip({ version: ['ipv4', 'ipv6'], cidr: 'forbidden' }).allow('').optional(),
  mac_address: Joi.string().trim().max(64).allow('').optional(),
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional(),
  configuration: Joi.object().optional(),
  metadata: Joi.object().optional(),
  gateway_type: Joi.string().valid('physical', 'http', 'simulated').optional(),
  connection_url: Joi.string().uri().allow('').optional(),
  base_url: Joi.string().uri().allow('').optional(),
  api_key: Joi.string().allow('').optional(),
  username: Joi.string().allow('').optional(),
  password: Joi.string().allow('').optional(),
  protocol_version: Joi.string().allow('').optional(),
  key_management_version: Joi.string().valid('v1', 'v2').optional(),
  ignore_ssl_cert: Joi.boolean().optional(),
}).min(1);

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
