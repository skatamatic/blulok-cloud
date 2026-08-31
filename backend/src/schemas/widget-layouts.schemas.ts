import Joi from 'joi';
import {
  WIDGET_SIZE_ENUM,
  GRID_COLS,
} from '@/utils/dashboard-layout-engine';

export const MAX_DASHBOARD_PAGES = 5;

/** Accept legacy tall layouts; clampLayout runs before validateLayout. */
export const widgetPositionSchema = Joi.object({
  x: Joi.number().min(0).max(GRID_COLS).required(),
  y: Joi.number().min(0).max(50).required(),
  w: Joi.number().min(1).max(GRID_COLS).required(),
  h: Joi.number().min(1).max(50).required(),
});

export const layoutConfigSchema = Joi.object({
  position: widgetPositionSchema.required(),
  size: Joi.string()
    .valid(...WIDGET_SIZE_ENUM)
    .required(),
}).unknown(true);

export const widgetPayloadSchema = Joi.object({
  widgetId: Joi.string().required(),
  widgetType: Joi.string().optional(),
  config: Joi.object().unknown(true).optional(),
  layoutConfig: layoutConfigSchema.required(),
  displayOrder: Joi.number().min(0).required(),
  isVisible: Joi.boolean().optional(),
});

export const pagePayloadSchema = Joi.object({
  id: Joi.string().uuid().optional(),
  name: Joi.string().max(100).optional(),
  pageOrder: Joi.number().min(0).max(MAX_DASHBOARD_PAGES - 1).required(),
  widgets: Joi.array().items(widgetPayloadSchema).required(),
});

export const savePagesSchema = Joi.object({
  activePageId: Joi.string().uuid().optional(),
  pages: Joi.array().items(pagePayloadSchema).min(1).max(MAX_DASHBOARD_PAGES).required(),
});

export const saveLegacySchema = Joi.object({
  layouts: Joi.array().items(widgetPayloadSchema).required(),
});

/** Accepts either v2 pages payload or legacy layouts array. */
export const saveDashboardBodySchema = Joi.object({
  activePageId: Joi.string().uuid().optional(),
  pages: Joi.array().items(pagePayloadSchema).min(1).max(MAX_DASHBOARD_PAGES).optional(),
  layouts: Joi.array().items(widgetPayloadSchema).optional(),
}).or('pages', 'layouts');

export const updateWidgetSchema = Joi.object({
  layoutConfig: layoutConfigSchema.required(),
  isVisible: Joi.boolean().optional(),
  displayOrder: Joi.number().min(0).optional(),
});

export const widgetIdParamSchema = Joi.object({
  widgetId: Joi.string().required(),
});

export const widgetPageIdQuerySchema = Joi.object({
  pageId: Joi.string().uuid().optional(),
});

export const widgetLayoutsListQuerySchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const resetDashboardSchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const loadDashboardSchema = Joi.object({
  activeFacilityId: Joi.string().uuid().optional(),
});

export const widgetLayoutsResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
}).unknown(true);

export const widgetMutationResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});

export const widgetTemplatesResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  templates: Joi.array().items(Joi.object()).required(),
});
