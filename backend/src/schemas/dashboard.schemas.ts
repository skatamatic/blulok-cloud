import Joi from 'joi';
import { UserRole } from '@/types/auth.types';
import { WIDGET_SIZE_ENUM, GRID_COLS } from '@/utils/dashboard-layout-engine';
import { successEnvelopeSchema, routeIdField } from '@/openapi/common-schemas';

export const MAX_DASHBOARD_PAGES = 5;

const positionSchema = Joi.object({
  x: Joi.number().min(0).max(GRID_COLS).required(),
  y: Joi.number().min(0).max(50).required(),
  w: Joi.number().min(1).max(GRID_COLS).required(),
  h: Joi.number().min(1).max(50).required(),
});

const layoutConfigSchema = Joi.object({
  position: positionSchema.required(),
  size: Joi.string()
    .valid(...WIDGET_SIZE_ENUM)
    .required(),
}).unknown(true);

const widgetPayloadSchema = Joi.object({
  widgetId: Joi.string().required(),
  widgetType: Joi.string().optional(),
  config: Joi.object().unknown(true).optional(),
  layoutConfig: layoutConfigSchema.required(),
  displayOrder: Joi.number().min(0).required(),
  isVisible: Joi.boolean().optional(),
});

const pagePayloadSchema = Joi.object({
  id: Joi.string().uuid().optional(),
  name: Joi.string().max(100).optional(),
  pageOrder: Joi.number().min(0).max(MAX_DASHBOARD_PAGES - 1).required(),
  widgets: Joi.array().items(widgetPayloadSchema).required(),
});

export const generalStatsQuerySchema = Joi.object({
  facility_id: Joi.string().uuid().optional(),
});

export const widgetLayoutsQuerySchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
  pageId: Joi.string().uuid().optional(),
});

export const saveWidgetPagesSchema = Joi.object({
  activePageId: Joi.string().uuid().optional(),
  pages: Joi.array().items(pagePayloadSchema).min(1).max(MAX_DASHBOARD_PAGES).required(),
});

export const saveWidgetLegacySchema = Joi.object({
  layouts: Joi.array().items(widgetPayloadSchema).required(),
});

export const updateWidgetLayoutSchema = Joi.object({
  layoutConfig: layoutConfigSchema.required(),
  isVisible: Joi.boolean().optional(),
  displayOrder: Joi.number().min(0).optional(),
});

export const widgetLayoutResetSchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const widgetIdParamSchema = Joi.object({
  widgetId: Joi.string().required(),
});

export const savedDashboardCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
});

export const savedDashboardUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(500).allow('', null).optional(),
}).min(1);

export const savedDashboardLoadSchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const savedDashboardIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const dashboardAssignmentCreateSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().required(),
  scope: Joi.string().valid('global', 'facility', 'user').required(),
  facilityId: Joi.string().uuid().allow(null).optional(),
  userId: Joi.string().uuid().allow(null).optional(),
  targetRole: Joi.string()
    .valid(...Object.values(UserRole))
    .required(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
});

export const dashboardAssignmentUpdateSchema = Joi.object({
  savedDashboardId: Joi.string().uuid().optional(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
}).min(1);

export const dashboardAssignmentIdParamSchema = Joi.object({
  id: routeIdField(),
});

export const dashboardResponseSchema = successEnvelopeSchema.unknown(true);
