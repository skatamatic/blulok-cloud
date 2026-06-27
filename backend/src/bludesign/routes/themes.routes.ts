/**
 * BluDesign Themes Routes
 *
 * API endpoints for managing custom themes.
 * Themes are bundles of skins that apply to different asset categories.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { DatabaseService } from '@/services/database.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  createThemeSchema,
  updateThemeSchema,
  themeIdParamSchema,
} from '@/schemas/bludesign/themes.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/themes';

router.use(authenticateToken as any);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Get all themes for the user',
    security: 'bearer',
    responses: {
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const db = DatabaseService.getInstance().connection;

    try {
      const customThemes = await db('bludesign_themes')
        .where('user_id', userId)
        .orderBy('created_at', 'asc');

      const themes = customThemes.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        categorySkins: row.category_skins ? JSON.parse(row.category_skins) : {},
        buildingSkin: row.building_skin || 'DEFAULT',
        buildingSkinId: row.building_skin_id,
        environment: row.environment ? JSON.parse(row.environment) : undefined,
        isBuiltin: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({
        success: true,
        themes,
      });
    } catch (error) {
      console.error('Error fetching themes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch themes',
      });
    }
  }),
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Get a specific theme by ID',
    security: 'bearer',
    params: themeIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const db = DatabaseService.getInstance().connection;

    try {
      const theme = await db('bludesign_themes')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!theme) {
        res.status(404).json({
          success: false,
          message: 'Theme not found',
        });
        return;
      }

      res.json({
        success: true,
        theme: {
          id: theme.id,
          name: theme.name,
          description: theme.description,
          categorySkins: theme.category_skins ? JSON.parse(theme.category_skins) : {},
          buildingSkin: theme.building_skin || 'DEFAULT',
          buildingSkinId: theme.building_skin_id,
          environment: theme.environment ? JSON.parse(theme.environment) : undefined,
          isBuiltin: false,
          createdAt: theme.created_at,
          updatedAt: theme.updated_at,
        },
      });
    } catch (error) {
      console.error('Error fetching theme:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch theme',
      });
    }
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Create a new custom theme',
    security: 'bearer',
    body: createThemeSchema,
    responses: {
      201: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const value = req.body;

    const userId = req.user!.userId;
    const db = DatabaseService.getInstance().connection;

    try {
      const id = `theme-custom-${uuidv4()}`;
      const now = new Date();

      await db('bludesign_themes').insert({
        id,
        user_id: userId,
        name: value.name,
        description: value.description || null,
        category_skins: value.categorySkins ? JSON.stringify(value.categorySkins) : null,
        building_skin: value.buildingSkin || 'DEFAULT',
        building_skin_id: value.buildingSkinId || null,
        environment: value.environment ? JSON.stringify(value.environment) : null,
        created_at: now,
        updated_at: now,
      });

      res.status(201).json({
        success: true,
        theme: {
          id,
          name: value.name,
          description: value.description,
          categorySkins: value.categorySkins || {},
          buildingSkin: value.buildingSkin || 'DEFAULT',
          buildingSkinId: value.buildingSkinId,
          environment: value.environment,
          isBuiltin: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error('Error creating theme:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create theme',
      });
    }
  }),
);

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Update an existing custom theme',
    security: 'bearer',
    params: themeIdParamSchema,
    body: updateThemeSchema,
    responses: {
      404: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const value = req.body;

    const userId = req.user!.userId;
    const db = DatabaseService.getInstance().connection;

    try {
      const existing = await db('bludesign_themes')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Theme not found',
        });
        return;
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date(),
      };

      if (value.name !== undefined) updateData.name = value.name;
      if (value.description !== undefined) updateData.description = value.description;
      if (value.categorySkins !== undefined) updateData.category_skins = JSON.stringify(value.categorySkins);
      if (value.buildingSkin !== undefined) updateData.building_skin = value.buildingSkin;
      if (value.buildingSkinId !== undefined) updateData.building_skin_id = value.buildingSkinId;
      if (value.environment !== undefined) updateData.environment = JSON.stringify(value.environment);

      await db('bludesign_themes')
        .where('id', id)
        .update(updateData);

      const updated = await db('bludesign_themes').where('id', id).first();

      res.json({
        success: true,
        theme: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          categorySkins: updated.category_skins ? JSON.parse(updated.category_skins) : {},
          buildingSkin: updated.building_skin || 'DEFAULT',
          buildingSkinId: updated.building_skin_id,
          environment: updated.environment ? JSON.parse(updated.environment) : undefined,
          isBuiltin: false,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    } catch (error) {
      console.error('Error updating theme:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update theme',
      });
    }
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Delete a custom theme',
    security: 'bearer',
    params: themeIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const db = DatabaseService.getInstance().connection;

    try {
      const existing = await db('bludesign_themes')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Theme not found',
        });
        return;
      }

      await db('bludesign_themes').where('id', id).del();

      res.json({
        success: true,
        message: 'Theme deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting theme:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete theme',
      });
    }
  }),
);

export { router as bluDesignThemesRouter };
