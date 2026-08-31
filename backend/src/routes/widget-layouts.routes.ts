/**
 * Widget Layouts Routes — page-centric dashboard persistence (v2) with legacy POST { layouts } support.
 */

import { Router, Response } from 'express';
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
  clampWidgetsOnPage,
  validateWidgetsOnPage,
} from '@/services/dashboard-layout.service';
import { parseActiveFacilityContext } from '@/utils/dashboard-assignment.utils';
import {
  validateLayoutConfig,
  clampLayout,
} from '@/utils/dashboard-layout-engine';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  savePagesSchema,
  saveLegacySchema,
  saveDashboardBodySchema,
  updateWidgetSchema,
  widgetIdParamSchema,
  widgetPageIdQuerySchema,
  widgetLayoutsListQuerySchema,
  resetDashboardSchema,
  widgetLayoutsResponseSchema,
  widgetMutationResponseSchema,
  widgetTemplatesResponseSchema,
} from '@/schemas/widget-layouts.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';

const router = Router();
const MOUNT = '/api/v1/widget-layouts';

router.use(authenticateToken as never);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard'],
    summary: 'Get user widget layout dashboard state',
    security: 'bearer',
    query: widgetLayoutsListQuerySchema,
    responses: {
      200: widgetLayoutsResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const activeFacilityId = req.query.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? [],
    );
    const response = await buildDashboardApiResponse(
      userId,
      req.user!.role,
      facilityContext,
    );
    res.json({ success: true, ...response });
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Dashboard'],
    summary: 'Save user widget layout (pages or legacy layouts)',
    security: 'bearer',
    body: saveDashboardBodySchema,
    responses: {
      200: widgetMutationResponseSchema,
      400: errorEnvelopeSchema,
    },
  },
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
        clampedPages as DashboardPagePayload[],
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
  }),
);

registerPut(
  router,
  '/:widgetId',
  {
    openApiPath: `${MOUNT}/{widgetId}`,
    tags: ['Dashboard'],
    summary: 'Update a widget layout on a dashboard page',
    security: 'bearer',
    params: widgetIdParamSchema,
    query: widgetPageIdQuerySchema,
    body: updateWidgetSchema,
    responses: {
      200: widgetMutationResponseSchema,
      400: errorEnvelopeSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    const { layoutConfig, isVisible, displayOrder } = req.body;
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
      size,
    );
    if (!check.valid) {
      res.status(400).json({ success: false, message: check.error });
      return;
    }

    const resolvedPageId = await UserWidgetLayoutModel.resolvePageId(
      userId,
      pageId,
    );

    const existing = await UserWidgetLayoutModel.findByUserAndWidget(
      userId,
      widgetId,
      resolvedPageId,
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
  }),
);

registerDelete(
  router,
  '/:widgetId',
  {
    openApiPath: `${MOUNT}/{widgetId}`,
    tags: ['Dashboard'],
    summary: 'Hide a widget from the dashboard',
    security: 'bearer',
    params: widgetIdParamSchema,
    query: widgetPageIdQuerySchema,
    responses: {
      200: widgetMutationResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    await UserWidgetLayoutModel.hideWidget(userId, widgetId, pageId);
    res.json({ success: true, message: 'Widget hidden successfully' });
  }),
);

registerPost(
  router,
  '/:widgetId/show',
  {
    openApiPath: `${MOUNT}/{widgetId}/show`,
    tags: ['Dashboard'],
    summary: 'Show a hidden widget on the dashboard',
    security: 'bearer',
    params: widgetIdParamSchema,
    query: widgetPageIdQuerySchema,
    responses: {
      200: widgetMutationResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { widgetId } = req.params;
    const userId = req.user!.userId;
    const pageId = req.query.pageId as string | undefined;

    await UserWidgetLayoutModel.showWidget(userId, widgetId, pageId);
    res.json({ success: true, message: 'Widget shown successfully' });
  }),
);

registerPost(
  router,
  '/reset',
  {
    openApiPath: `${MOUNT}/reset`,
    tags: ['Dashboard'],
    summary: 'Clear personal working state and return resolved layout',
    security: 'bearer',
    body: resetDashboardSchema,
    responses: {
      200: widgetLayoutsResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    await UserWidgetLayoutModel.clearUserDashboard(userId);
    const activeFacilityId = req.body?.activeFacilityId as string | undefined;
    const facilityContext = parseActiveFacilityContext(
      activeFacilityId,
      req.user!.facilityIds ?? [],
    );
    const response = await buildDashboardApiResponse(
      userId,
      req.user!.role,
      facilityContext,
    );
    res.json({
      success: true,
      message: 'Personal dashboard cleared; showing assigned or default layout',
      ...response,
    });
  }),
);

registerPost(
  router,
  '/reset-defaults',
  {
    openApiPath: `${MOUNT}/reset-defaults`,
    tags: ['Dashboard'],
    summary: 'Reset widget layout to system defaults',
    security: 'bearer',
    responses: {
      200: widgetMutationResponseSchema,
    },
  },
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    await UserWidgetLayoutModel.resetToDefaults(userId);
    res.json({ success: true, message: 'Widget layout reset to defaults' });
  }),
);

registerGet(
  router,
  '/templates',
  {
    openApiPath: `${MOUNT}/templates`,
    tags: ['Dashboard'],
    summary: 'List available widget templates for the current user role',
    security: 'bearer',
    responses: {
      200: widgetTemplatesResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const templates = await DefaultWidgetTemplateModel.getAvailableForUser(
      req.user!.role,
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
  }),
);

export { router as widgetLayoutsRouter };
