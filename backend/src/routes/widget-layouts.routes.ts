/**
 * Widget Layouts Routes — page-centric dashboard persistence (v2) with legacy POST { layouts } support.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import {
  UserWidgetLayoutModel,
  DefaultWidgetTemplateModel,
  DashboardPagePayload,
} from '@/models/user-widget-layout.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import {
  buildDashboardApiResponse,
  clampAndValidatePages,
  clampWidgetsOnPage,
  validateWidgetsOnPage,
} from '@/services/dashboard-layout.service';
import { parseActiveFacilityContext } from '@/utils/dashboard-assignment.utils';
import {
  WIDGET_SIZE_ENUM,
  validateLayoutConfig,
  clampLayout,
  GRID_COLS,
} from '@/utils/dashboard-layout-engine';

const router = Router();
const MAX_DASHBOARD_PAGES = 5;

router.use(authenticateToken as never);

/** Accept legacy tall layouts; clampLayout runs before validateLayout. */
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

const savePagesSchema = Joi.object({
  activePageId: Joi.string().uuid().optional(),
  pages: Joi.array().items(pagePayloadSchema).min(1).max(MAX_DASHBOARD_PAGES).required(),
});

const saveLegacySchema = Joi.object({
  layouts: Joi.array().items(widgetPayloadSchema).required(),
});

const updateWidgetSchema = Joi.object({
  layoutConfig: layoutConfigSchema.required(),
  isVisible: Joi.boolean().optional(),
  displayOrder: Joi.number().min(0).optional(),
});

// GET /widget-layouts
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const activeFacilityId = req.query.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? []
    );
    const response = await buildDashboardApiResponse(
      userId,
      req.user!.role,
      facilityContext
    );
    res.json({ success: true, ...response });
  })
);

// POST /widget-layouts — legacy { layouts } or { pages }
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const pagesResult = savePagesSchema.validate(req.body);
    if (!pagesResult.error) {
      const pages = pagesResult.value.pages as Array<{
        id?: string;
        name?: string;
        pageOrder: number;
        widgets: Array<{
          widgetId: string;
          widgetType?: string;
          config?: Record<string, unknown>;
          layoutConfig: {
            position: { x: number; y: number; w: number; h: number };
            size: string;
          };
          displayOrder: number;
          isVisible?: boolean;
        }>;
      }>;
      const clampedPages = pages.map((page) => ({
        ...page,
        widgets: clampWidgetsOnPage(page.widgets),
      }));
      for (const page of clampedPages) {
        const err = validateWidgetsOnPage(page.widgets);
        if (err) {
          res.status(400).json({ success: false, message: err });
          return;
        }
      }
      await UserWidgetLayoutModel.saveDashboardState(
        userId,
        clampedPages as DashboardPagePayload[]
      );
      res.json({
        success: true,
        message: 'Dashboard saved successfully',
      });
      return;
    }

    const legacyResult = saveLegacySchema.validate(req.body);
    if (legacyResult.error) {
      res.status(400).json({
        success: false,
        message:
          pagesResult.error?.details[0]?.message ||
          legacyResult.error.details[0]?.message ||
          'Validation error',
      });
      return;
    }

    const layouts = legacyResult.value.layouts as Array<{
      widgetId: string;
      widgetType?: string;
      config?: Record<string, unknown>;
      layoutConfig: {
        position: { x: number; y: number; w: number; h: number };
        size: string;
      };
      displayOrder: number;
      isVisible?: boolean;
    }>;
    const clampedLayouts = clampWidgetsOnPage(layouts);
    const err = validateWidgetsOnPage(clampedLayouts);
    if (err) {
      res.status(400).json({ success: false, message: err });
      return;
    }

    await UserWidgetLayoutModel.saveUserLayouts(userId, clampedLayouts);
    res.json({
      success: true,
      message: 'Widget layout saved successfully',
    });
  })
);

// PUT /widget-layouts/:widgetId
router.put(
  '/:widgetId',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    if (!widgetId) {
      res.status(400).json({ success: false, message: 'Widget ID is required' });
      return;
    }

    const { error, value } = updateWidgetSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0]?.message || 'Validation error',
      });
      return;
    }

    const { layoutConfig, isVisible, displayOrder } = value;
    const clampedItems = clampLayout([
      {
        i: widgetId,
        ...(layoutConfig.position as { x: number; y: number; w: number; h: number }),
      },
    ]);
    if (clampedItems.length === 0) {
      res.status(400).json({ success: false, message: 'Invalid layout' });
      return;
    }
    const pos = clampedItems[0];
    layoutConfig.position = { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
    const size = layoutConfig.size as string;
    const check = validateLayoutConfig(
      layoutConfig.position as { x: number; y: number; w: number; h: number },
      size
    );
    if (!check.valid) {
      res.status(400).json({ success: false, message: check.error });
      return;
    }

    const resolvedPageId = await UserWidgetLayoutModel.resolvePageId(
      userId,
      pageId
    );

    const existing = await UserWidgetLayoutModel.findByUserAndWidget(
      userId,
      widgetId,
      resolvedPageId
    );

    if (existing) {
      const updateData: Record<string, unknown> = {
        layout_config: layoutConfig,
      };
      if (isVisible !== undefined) updateData.is_visible = isVisible;
      if (displayOrder !== undefined) updateData.display_order = displayOrder;
      await UserWidgetLayoutModel.updateById(existing.id, updateData);
    } else {
      await UserWidgetLayoutModel.create({
        user_id: userId,
        page_id: resolvedPageId,
        widget_id: widgetId,
        widget_type: UserWidgetLayoutModel.extractWidgetType(widgetId),
        layout_config: layoutConfig,
        is_visible: isVisible !== undefined ? isVisible : true,
        display_order: displayOrder ?? 0,
      });
    }

    res.json({ success: true, message: 'Widget updated successfully' });
  })
);

// DELETE /widget-layouts/:widgetId
router.delete(
  '/:widgetId',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    if (!widgetId) {
      res.status(400).json({ success: false, message: 'Widget ID is required' });
      return;
    }

    await UserWidgetLayoutModel.hideWidget(userId, widgetId, pageId);
    res.json({ success: true, message: 'Widget hidden successfully' });
  })
);

// POST /widget-layouts/:widgetId/show
router.post(
  '/:widgetId/show',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    if (!widgetId) {
      res.status(400).json({ success: false, message: 'Widget ID is required' });
      return;
    }

    await UserWidgetLayoutModel.showWidget(userId, widgetId, pageId);
    res.json({ success: true, message: 'Widget shown successfully' });
  })
);

// POST /widget-layouts/reset — clear personal working state and return resolved layout
router.post(
  '/reset',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    await UserWidgetLayoutModel.clearUserDashboard(userId);
    const activeFacilityId = req.body?.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? []
    );
    const response = await buildDashboardApiResponse(
      userId,
      req.user!.role,
      facilityContext
    );
    res.json({
      success: true,
      message: 'Personal dashboard cleared; showing assigned or default layout',
      ...response,
    });
  })
);

// POST /widget-layouts/reset-defaults — legacy reset to system widget templates
router.post(
  '/reset-defaults',
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    await UserWidgetLayoutModel.resetToDefaults(userId);
    res.json({ success: true, message: 'Widget layout reset to defaults' });
  })
);

// GET /widget-layouts/templates
router.get(
  '/templates',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const templates = await DefaultWidgetTemplateModel.getAvailableForUser(
      req.user!.role
    );

    res.json({
      success: true,
      templates: templates.map((template) => ({
        widgetId: template.widget_id,
        widgetType: template.widget_type,
        name: template.name,
        description: template.description,
        defaultConfig: template.default_config,
        availableSizes: template.available_sizes,
        defaultOrder: template.default_order,
      })),
    });
  })
);

export { router as widgetLayoutsRouter };
