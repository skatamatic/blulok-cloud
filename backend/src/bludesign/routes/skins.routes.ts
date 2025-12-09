/**
 * BluDesign Skins Routes
 * 
 * API endpoints for managing custom skins.
 * Skins define materials for asset parts within a category.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { DatabaseService } from '@/services/database.service';

const router = Router();

// All routes require authentication
router.use(authenticateToken as any);

// Validation schemas
const partMaterialSchema = Joi.object({
  color: Joi.string().required(),
  metalness: Joi.number().min(0).max(1).required(),
  roughness: Joi.number().min(0).max(1).required(),
  emissive: Joi.string().optional(),
  emissiveIntensity: Joi.number().optional(),
  transparent: Joi.boolean().optional(),
  opacity: Joi.number().min(0).max(1).optional(),
  textureUrl: Joi.string().uri().optional().allow(''),
  normalMapUrl: Joi.string().uri().optional().allow(''),
  roughnessMapUrl: Joi.string().uri().optional().allow(''),
  shaderHint: Joi.string().valid('wireframe', 'glass-paned', 'glass-floor', 'glass-roof', 'default').optional(),
});

const createSkinSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  category: Joi.string().required(),
  partMaterials: Joi.object().pattern(Joi.string(), partMaterialSchema).required(),
  thumbnail: Joi.string().optional(),
});

const updateSkinSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  partMaterials: Joi.object().pattern(Joi.string(), partMaterialSchema).optional(),
  thumbnail: Joi.string().optional(),
});

/**
 * GET /bludesign/skins
 * Get all custom skins for the user
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
}));

/**
 * GET /bludesign/skins/:id
 * Get a specific skin by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
}));

/**
 * POST /bludesign/skins
 * Create a new custom skin
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = createSkinSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error',
    });
    return;
  }
  
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
}));

/**
 * PUT /bludesign/skins/:id
 * Update an existing custom skin
 */
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { error, value } = updateSkinSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error',
    });
    return;
  }
  
  const userId = req.user!.userId;
  const db = DatabaseService.getInstance().connection;
  
  try {
    // Check skin exists and belongs to user
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
    
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };
    
    if (value.name !== undefined) updateData.name = value.name;
    if (value.description !== undefined) updateData.description = value.description;
    if (value.partMaterials !== undefined) updateData.part_materials = JSON.stringify(value.partMaterials);
    if (value.thumbnail !== undefined) updateData.thumbnail = value.thumbnail;
    
    await db('bludesign_skins')
      .where('id', id)
      .update(updateData);
    
    // Fetch updated skin
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
}));

/**
 * DELETE /bludesign/skins/:id
 * Delete a custom skin
 */
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const db = DatabaseService.getInstance().connection;
  
  try {
    // Check skin exists and belongs to user
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
}));

export { router as bluDesignSkinsRouter };

