import Joi from 'joi';
import { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';
import {
  ACCESS_EVENT_ACTIONS,
  ACCESS_EVENT_ACTOR_ROLES,
  ACCESS_EVENT_DENIAL_REASONS,
  ACCESS_EVENT_METHODS,
} from '@/services/access/access-event.types';

export const gatewayTidField = Joi.alternatives().try(Joi.number(), Joi.string()).optional();

export const gatewayStartupBodySchema = Joi.object({
  lock_id: Joi.string().required(),
  tid: gatewayTidField,
});

export const gatewayFallbackPassBodySchema = Joi.object({
  fallbackJwt: Joi.string().required(),
  tid: gatewayTidField,
});

export const gatewayAccessEventSchema = Joi.object({
  event_id: Joi.string().required(),
  correlation_id: Joi.string().optional(),
  occurred_at: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).required(),
  facility_id: Joi.string().optional(),
  unit_id: Joi.string().optional(),
  device_id: Joi.string().required(),
  gateway_id: Joi.string().optional(),
  action: Joi.string().valid(...ACCESS_EVENT_ACTIONS).required(),
  method: Joi.string().valid(...ACCESS_EVENT_METHODS).required(),
  success: Joi.boolean().required(),
  denial_reason: Joi.string().valid(...ACCESS_EVENT_DENIAL_REASONS).optional(),
  reason_message: Joi.string().max(500).optional(),
  actor: Joi.object({
    user_id: Joi.string().optional(),
    role: Joi.string().valid(...ACCESS_EVENT_ACTOR_ROLES).required(),
    name: Joi.string().max(255).optional(),
    app_device_id: Joi.string().optional(),
  }).optional(),
  keypad: Joi.object({
    entered_code: Joi.string().max(64).optional(),
    code_id: Joi.string().optional(),
    code_label: Joi.string().max(255).optional(),
    schedule_id: Joi.string().optional(),
    schedule_name: Joi.string().max(255).optional(),
    zone_id: Joi.string().optional(),
    zone_name: Joi.string().max(255).optional(),
  }).optional(),
  route_pass: Joi.object({
    route_pass_id: Joi.string().optional(),
    issuance_id: Joi.string().optional(),
    nonce: Joi.string().optional(),
  }).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).custom((value, helpers) => {
  if (!value.success && !value.denial_reason) {
    return helpers.error('any.custom', { message: 'denial_reason is required when success is false' });
  }
  return value;
});

export const gatewayAccessEventsBodySchema = Joi.object({
  tid: gatewayTidField,
  facility_id: Joi.string().optional(),
  events: Joi.array().items(gatewayAccessEventSchema).min(1).required(),
});

export const gatewayAddLogBodySchema = Joi.alternatives().try(
  Joi.object({
    facility_id: Joi.string().uuid().optional(),
    tid: gatewayTidField,
    message: Joi.string().required(),
  }),
  Joi.object({
    facility_id: Joi.string().uuid().optional(),
    tid: gatewayTidField,
    messages: Joi.array().items(Joi.string()).min(1).max(GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH).required(),
  }),
);

const lockInventoryFields = {
  lock_id: Joi.string().trim().min(1).required(),
  lock_number: Joi.number().optional(),
  name: Joi.string().trim().max(255).optional(),
  location_description: Joi.string().trim().max(255).optional(),
  state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
  locked: Joi.boolean().optional(),
  battery_level: Joi.number().optional(),
  battery_unit: Joi.string().optional(),
  online: Joi.boolean().optional(),
  signal_strength: Joi.number().optional(),
  temperature_value: Joi.number().optional(),
  temperature_unit: Joi.string().optional(),
  firmware_version: Joi.string().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const accessInventoryFields = {
  kind: Joi.string().valid('access_control').required(),
  access_id: Joi.string().trim().min(1).required(),
  relay_channel: Joi.number().integer().min(1).max(8).default(1),
  device_type: Joi.string().valid('gate', 'door', 'elevator').optional(),
  name: Joi.string().trim().max(255).optional(),
  location_description: Joi.string().trim().max(255).optional(),
  online: Joi.boolean().optional(),
  locked: Joi.boolean().optional(),
  access_methods: Joi.array().items(Joi.string().valid('app', 'keypad', 'fob')).min(1).optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const lockInventoryItemSchema = Joi.object({
  kind: Joi.string().valid('lock').required(),
  ...lockInventoryFields,
});

const accessInventoryItemSchema = Joi.object(accessInventoryFields);

const networkInfraInventoryItemSchema = Joi.object({
  kind: Joi.string().valid('bridge', 'friend_node').required(),
  serial: Joi.string().trim().min(1).required(),
  state: Joi.string().trim().max(64).optional(),
  firmware_version: Joi.string().trim().max(128).allow(null).optional(),
  info: Joi.object().unknown(true).optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
}).unknown(true);

const gatewayInventoryUpdateSchema = Joi.object({
  kind: Joi.string().valid('gateway').required(),
  serial: Joi.string().trim().min(1).optional(),
  state: Joi.string().trim().max(64).optional(),
  firmware_version: Joi.string().trim().max(128).optional(),
  info: Joi.object().unknown(true).optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
}).unknown(true);

export const gatewayInventorySyncBodySchema = Joi.object({
  tid: gatewayTidField,
  facility_id: Joi.string().optional(),
  devices: Joi.array()
    .items(
      Joi.alternatives().try(
        accessInventoryItemSchema,
        lockInventoryItemSchema,
        networkInfraInventoryItemSchema,
        gatewayInventoryUpdateSchema,
      ),
    )
    .required(),
});

const lockStateFields = {
  lock_id: Joi.string().trim().min(1).required(),
  lock_number: Joi.number().optional(),
  serial: Joi.string().trim().min(1).optional(),
  state: Joi.string().valid('CLOSED', 'OPENED', 'ERROR', 'UNKNOWN').optional(),
  locked: Joi.boolean().optional(),
  battery_level: Joi.number().optional(),
  battery_unit: Joi.string().optional(),
  online: Joi.boolean().optional(),
  signal_strength: Joi.number().optional(),
  temperature: Joi.number().optional(),
  temperature_value: Joi.number().optional(),
  temperature_unit: Joi.string().optional(),
  firmware_version: Joi.string().optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
  error_code: Joi.string().allow(null, '').optional(),
  error_message: Joi.string().allow(null, '').optional(),
  source: Joi.string().valid('GATEWAY', 'USER', 'CLOUD').optional(),
};

const accessStateFields = {
  kind: Joi.string().valid('access_control').required(),
  access_id: Joi.string().trim().min(1).required(),
  relay_channel: Joi.number().integer().min(1).max(8).default(1),
  online: Joi.boolean().optional(),
  locked: Joi.boolean().optional(),
  access_methods: Joi.array().items(Joi.string().valid('app', 'keypad', 'fob')).min(1).optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
};

const lockStateUpdateSchema = Joi.object({
  kind: Joi.string().valid('lock').required(),
  ...lockStateFields,
});

const accessStateUpdateSchema = Joi.object(accessStateFields);

const networkInfraStateItemSchema = Joi.object({
  kind: Joi.string().valid('bridge', 'friend_node').required(),
  serial: Joi.string().trim().min(1).required(),
  state: Joi.string().trim().max(64).optional(),
  firmware_version: Joi.string().trim().max(128).allow(null).optional(),
  info: Joi.object().unknown(true).optional(),
  last_seen: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).optional(),
}).unknown(true);

export const gatewayStateUpdateBodySchema = Joi.object({
  tid: gatewayTidField,
  facility_id: Joi.string().optional(),
  updates: Joi.array()
    .items(
      Joi.alternatives().try(
        accessStateUpdateSchema,
        lockStateUpdateSchema,
        networkInfraStateItemSchema,
      ),
    )
    .required(),
});

export const gatewayAccessCodesQuerySchema = Joi.object({
  facility_id: Joi.string().optional(),
});
