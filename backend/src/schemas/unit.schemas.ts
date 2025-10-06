import Joi from 'joi';

export const createUnitSchema = Joi.object({
  unit_number: Joi.string().required().min(1).max(50).messages({
    'string.empty': 'Unit number is required',
    'string.min': 'Unit number must be at least 1 character long',
    'string.max': 'Unit number must not exceed 50 characters'
  }),
  facility_id: Joi.string().uuid().required().messages({
    'string.empty': 'Facility ID is required',
    'string.guid': 'Facility ID must be a valid UUID'
  }),
  unit_type: Joi.string().max(100).optional().messages({
    'string.max': 'Unit type must not exceed 100 characters'
  }),
  status: Joi.string().valid('available', 'occupied', 'maintenance', 'reserved').default('available').messages({
    'any.only': 'Status must be one of: available, occupied, maintenance, reserved'
  }),
  size_sqft: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Size must be a positive number',
    'number.precision': 'Size must have at most 2 decimal places'
  }),
  monthly_rate: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Monthly rate must be a positive number',
    'number.precision': 'Monthly rate must have at most 2 decimal places'
  }),
  description: Joi.string().optional().allow('').messages({
    'string.base': 'Description must be a string'
  }),
  features: Joi.array().items(Joi.string()).optional().default([]),
  metadata: Joi.object().optional().default({})
});

export const updateUnitSchema = Joi.object({
  unit_number: Joi.string().min(1).max(50).optional().messages({
    'string.min': 'Unit number must be at least 1 character long',
    'string.max': 'Unit number must not exceed 50 characters'
  }),
  unit_type: Joi.string().max(100).optional().messages({
    'string.max': 'Unit type must not exceed 100 characters'
  }),
  status: Joi.string().valid('available', 'occupied', 'maintenance', 'reserved').optional().messages({
    'any.only': 'Status must be one of: available, occupied, maintenance, reserved'
  }),
  size_sqft: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Size must be a positive number',
    'number.precision': 'Size must have at most 2 decimal places'
  }),
  monthly_rate: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Monthly rate must be a positive number',
    'number.precision': 'Monthly rate must have at most 2 decimal places'
  }),
  description: Joi.string().optional().allow('').messages({
    'string.base': 'Description must be a string'
  }),
  features: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional()
});

export const assignTenantSchema = Joi.object({
  tenant_id: Joi.string().uuid().required().messages({
    'string.empty': 'Tenant ID is required',
    'string.guid': 'Tenant ID must be a valid UUID'
  }),
  start_date: Joi.date().iso().required().messages({
    'date.base': 'Start date must be a valid date',
    'date.format': 'Start date must be in ISO format'
  }),
  end_date: Joi.date().iso().greater(Joi.ref('start_date')).optional().messages({
    'date.base': 'End date must be a valid date',
    'date.format': 'End date must be in ISO format',
    'date.greater': 'End date must be after start date'
  }),
  rent_amount: Joi.number().positive().precision(2).optional().messages({
    'number.positive': 'Rent amount must be a positive number',
    'number.precision': 'Rent amount must have at most 2 decimal places'
  }),
  is_primary: Joi.boolean().default(false),
  access_type: Joi.string().valid('full', 'limited', 'emergency').default('full').messages({
    'any.only': 'Access type must be one of: full, limited, emergency'
  }),
  notes: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Notes must not exceed 500 characters'
  })
});
