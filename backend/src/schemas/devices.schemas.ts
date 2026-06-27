import Joi from 'joi';

export const listQuerySchema = Joi.object({
  facility_id: Joi.string().optional(),
  device_type: Joi.string().valid('access_control', 'blulok', 'all').optional(),
  device_scope: Joi.string().valid('operational', 'network_infra', 'all').optional(),
  status: Joi.string().optional(),
  search: Joi.string().max(200).optional(),
  sortBy: Joi.string().optional(),
  sort_by: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
  projection: Joi.string().valid('id').optional(),
})
  .unknown(true)
  .prefs({ convert: true });

export const deviceIdParamSchema = Joi.object({
  id: Joi.string().required(),
});

export const blulokDeviceIdParamSchema = Joi.object({
  deviceId: Joi.string().required(),
});

export const facilityHierarchyParamSchema = Joi.object({
  facilityId: Joi.string().required(),
});

export const deviceTypeStatusParamSchema = Joi.object({
  deviceType: Joi.string().valid('access_control', 'blulok').required(),
  id: Joi.string().required(),
});

export const accessControlDeviceSchema = Joi.object({
  gateway_id: Joi.string().required(),
  device_serial: Joi.string().trim().min(1).max(100).required(),
  name: Joi.string().required(),
  device_type: Joi.string().valid('door', 'gate', 'elevator').required(),
  location_description: Joi.string().required(),
  relay_channel: Joi.number().integer().min(1).max(8).required(),
  access_methods: Joi.array().items(Joi.string().valid('app', 'keypad', 'fob')).min(1).optional(),
  supports_remote_lock: Joi.boolean().optional(),
});

export const updateAccessControlDeviceSchema = Joi.object({
  name: Joi.string().optional(),
  location_description: Joi.string().optional(),
  device_serial: Joi.string().trim().min(1).max(100).optional(),
  relay_channel: Joi.number().integer().min(1).max(8).optional(),
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional(),
  is_locked: Joi.boolean().optional(),
  supports_remote_lock: Joi.boolean().optional(),
  device_settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
  access_methods: Joi.array().items(Joi.string().valid('app', 'keypad', 'fob')).min(1).optional(),
}).min(1);

export const updateBluLokMetadataSchema = Joi.object({
  device_serial: Joi.string().trim().min(1).max(100).optional(),
  serial: Joi.string().trim().min(1).max(100).optional(),
  firmware_version: Joi.string().trim().max(100).optional(),
  supports_remote_lock: Joi.boolean().optional(),
  device_settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
}).min(1);

export const updateAccessControlMetadataSchema = Joi.object({
  name: Joi.string().optional(),
  location_description: Joi.string().optional(),
  device_serial: Joi.string().trim().min(1).max(100).optional(),
  relay_channel: Joi.number().integer().min(1).max(8).optional(),
  device_type: Joi.string().valid('door', 'gate', 'elevator').optional(),
  supports_remote_lock: Joi.boolean().optional(),
  device_settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
  access_methods: Joi.array().items(Joi.string().valid('app', 'keypad', 'fob')).min(1).optional(),
}).min(1);

export const bluLokDeviceSchema = Joi.object({
  gateway_id: Joi.string().required(),
  unit_id: Joi.string().trim().optional().allow('', null),
  name: Joi.string().trim().max(200).optional().allow(''),
  location_description: Joi.string().trim().max(500).optional().allow(''),
  firmware_version: Joi.string().trim().max(100).optional().allow(''),
  supports_remote_lock: Joi.boolean().optional(),
  device_settings: Joi.object().optional(),
  metadata: Joi.object().optional(),
  /** Legacy — accepted for backwards compatibility, ignored */
  device_type: Joi.string().valid('blulok').optional(),
  serial: Joi.string().trim().min(1).optional(),
  device_serial: Joi.string().trim().min(1).optional(),
})
  .or('serial', 'device_serial')
  .custom((value, helpers) => {
    if (value.serial && value.device_serial && value.serial.trim() !== value.device_serial.trim()) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'any.invalid': 'serial and device_serial must match when both are provided',
  });

export const lockStatusSchema = Joi.object({
  lock_status: Joi.string().valid('locked', 'unlocked', 'error').required(),
});

export const deviceStatusSchema = Joi.object({
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').required(),
});

export const assignBlulokDeviceBodySchema = Joi.object({
  unit_id: Joi.string().required(),
});

export const devicesListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).optional(),
  devices: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
}).unknown(true);

export const deviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  device: Joi.object().required(),
}).unknown(true);

export const deviceWithSideEffectsResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  device: Joi.object().required(),
  sideEffects: Joi.object().optional(),
}).unknown(true);

export const hierarchyResponseSchema = Joi.object({
  hierarchy: Joi.object().required(),
});

export const denylistResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  entries: Joi.array().items(Joi.object()).required(),
});

export const deviceStatusUpdateResponseSchema = Joi.object({
  message: Joi.string().required(),
});

export const lockCommandResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
  lock_status: Joi.string().optional(),
  previous_status: Joi.string().optional(),
}).unknown(true);

export const assignDeviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});

export const removeDeviceResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
  removed: Joi.object().required(),
});
