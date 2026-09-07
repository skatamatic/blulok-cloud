/**
 * BluDesign Skins Routes
 *
 * API endpoints for managing custom skins.
 * Skins define materials for asset parts within a category.
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
  createSkinSchema,
  updateSkinSchema,
  skinIdParamSchema,
} from '@/schemas/bludesign/skins.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/skins';

router.use(authenticateToken as any);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Get all custom skins for the user',
    security: 'bearer',
    responses: {
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const category = req.query.category as string | undefined;
    const db = DatabaseService.getInstance().connection;

    try {
      let query = db('bludesign_skins')
        .where('user_id', userId)
        .orderBy('created_at', 'asc');

      if (category) {
        query = query.where('category', category);
      }

      const customSkins = await query;

      const skins = customSkins.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        partMaterials: row.part_materials ? JSON.parse(row.part_materials) : {},
        thumbnail: row.thumbnail,
        isBuiltin: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({
        success: true,
        skins,
      });
    } catch (error) {
      console.error('Error fetching skins:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch skins',
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
    summary: 'Get a specific skin by ID',
    security: 'bearer',
    params: skinIdParamSchema,
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
      const skin = await db('bludesign_skins')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!skin) {
        res.status(404).json({
          success: false,
          message: 'Skin not found',
        });
        return;
      }

      res.json({
        success: true,
        skin: {
          id: skin.id,
          name: skin.name,
          description: skin.description,
          category: skin.category,
          partMaterials: skin.part_materials ? JSON.parse(skin.part_materials) : {},
          thumbnail: skin.thumbnail,
          isBuiltin: false,
          createdAt: skin.created_at,
          updatedAt: skin.updated_at,
        },
      });
    } catch (error) {
      console.error('Error fetching skin:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch skin',
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
    summary: 'Create a new custom skin',
    security: 'bearer',
    body: createSkinSchema,
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
      const id = `skin-custom-${uuidv4()}`;
      const now = new Date();

      await db('bludesign_skins').insert({
        id,
        user_id: userId,
        name: value.name,
        description: value.description || null,
        category: value.category,
        part_materials: JSON.stringify(value.partMaterials),
        thumbnail: value.thumbnail || null,
        created_at: now,
        updated_at: now,
      });

      res.status(201).json({
        success: true,
        skin: {
          id,
          name: value.name,
          description: value.description,
          category: value.category,
          partMaterials: value.partMaterials,
          thumbnail: value.thumbnail,
          isBuiltin: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error('Error creating skin:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create skin',
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
    summary: 'Update an existing custom skin',
    security: 'bearer',
    params: skinIdParamSchema,
    body: updateSkinSchema,
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
      const existing = await db('bludesign_skins')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Skin not found',
        });
        return;
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date(),
      };

      if (value.name !== undefined) updateData.name = value.name;
      if (value.description !== undefined) updateData.description = value.description;
      if (value.partMaterials !== undefined) updateData.part_materials = JSON.stringify(value.partMaterials);
      if (value.thumbnail !== undefined) updateData.thumbnail = value.thumbnail;

      await db('bludesign_skins')
        .where('id', id)
        .update(updateData);

      const updated = await db('bludesign_skins').where('id', id).first();

      res.json({
        success: true,
        skin: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          category: updated.category,
          partMaterials: updated.part_materials ? JSON.parse(updated.part_materials) : {},
          thumbnail: updated.thumbnail,
          isBuiltin: false,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    } catch (error) {
      console.error('Error updating skin:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update skin',
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
    summary: 'Delete a custom skin',
    security: 'bearer',
    params: skinIdParamSchema,
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
      const existing = await db('bludesign_skins')
        .where('id', id)
        .where('user_id', userId)
        .first();

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Skin not found',
        });
        return;
      }

      await db('bludesign_skins').where('id', id).del();

      res.json({
        success: true,
        message: 'Skin deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting skin:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete skin',
      });
    }
  }),
);

export { router as bluDesignSkinsRouter };
