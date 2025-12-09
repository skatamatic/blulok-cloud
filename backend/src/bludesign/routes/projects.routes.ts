/**
 * BluDesign Projects Routes
 * 
 * API routes for managing BluDesign projects.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { BluDesignProjectModel } from '../models/bludesign-project.model';
import { StorageProviderType } from '../types/bludesign.types';
import { createStorageProvider, validateStorageConfig } from '../services/storage';

const router = Router();

// Validation schemas
const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(2000).optional(),
  storageProvider: Joi.string().valid('local', 'gcs', 'gdrive').optional(),
  storageConfig: Joi.object().optional(),
  defaultBranding: Joi.object({
    primaryColor: Joi.string().required(),
    secondaryColor: Joi.string().required(),
    logoUrl: Joi.string().uri().optional(),
    overrides: Joi.array().items(Joi.object({
      slotName: Joi.string().required(),
      color: Joi.string().optional(),
      textureUrl: Joi.string().uri().optional(),
    })).optional(),
  }).optional(),
});

const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(2000).allow(null).optional(),
  storageProvider: Joi.string().valid('local', 'gcs', 'gdrive').optional(),
  storageConfig: Joi.object().optional(),
  defaultBranding: Joi.object({
    primaryColor: Joi.string().required(),
    secondaryColor: Joi.string().required(),
    logoUrl: Joi.string().uri().optional(),
    overrides: Joi.array().items(Joi.object({
      slotName: Joi.string().required(),
      color: Joi.string().optional(),
      textureUrl: Joi.string().uri().optional(),
    })).optional(),
  }).optional(),
}).min(1);

// Apply authentication to all routes
router.use(authenticateToken as any);

/**
 * GET /api/v1/bludesign/projects
 * List all projects for the current user
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const projects = await BluDesignProjectModel.findByOwner(user.userId);
  
  res.json({
    success: true,
    projects,
    total: projects.length,
  });
}));

/**
 * GET /api/v1/bludesign/projects/:id
 * Get a specific project
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  
  const project = await BluDesignProjectModel.findById(id);
  
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return;
  }
  
  // Check ownership
  if (project.ownerId !== user.userId) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  
  res.json({ success: true, project });
}));

/**
 * POST /api/v1/bludesign/projects
 * Create a new project
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  
  const { error, value } = createProjectSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error',
    });
    return;
  }
  
  // Validate storage config if provided
  if (value.storageProvider && value.storageConfig) {
    const configErrors = validateStorageConfig({
      type: value.storageProvider as StorageProviderType,
      config: value.storageConfig,
    });
    if (configErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid storage configuration',
        errors: configErrors,
      });
      return;
    }
  }
  
  const project = await BluDesignProjectModel.createProject(user.userId, value);
  
  // Initialize storage for the project
  try {
    const provider = createStorageProvider({
      type: project.storageProvider,
      config: project.storageConfig || { basePath: './storage/bludesign' },
    });
    await provider.initialize();
    await provider.initializeProject(project.id);
  } catch (storageError: any) {
    // Delete the project if storage init fails
    await BluDesignProjectModel.deleteProject(project.id);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize project storage',
      error: storageError.message,
    });
    return;
  }
  
  res.status(201).json({ success: true, project });
}));

/**
 * PUT /api/v1/bludesign/projects/:id
 * Update a project
 */
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  
  // Check ownership
  const isOwner = await BluDesignProjectModel.isOwner(id, user.userId);
  if (!isOwner) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  
  const { error, value } = updateProjectSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error',
    });
    return;
  }
  
  const project = await BluDesignProjectModel.updateProject(id, value);
  
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return;
  }
  
  res.json({ success: true, project });
}));

/**
 * DELETE /api/v1/bludesign/projects/:id
 * Delete a project and all its contents
 */
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  
  const project = await BluDesignProjectModel.findById(id);
  
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return;
  }
  
  // Check ownership
  if (project.ownerId !== user.userId) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  
  // Delete storage
  try {
    const provider = createStorageProvider({
      type: project.storageProvider,
      config: project.storageConfig || { basePath: './storage/bludesign' },
    });
    await provider.deleteProject(id);
  } catch (storageError) {
    console.error('Failed to delete project storage:', storageError);
    // Continue with database deletion even if storage fails
  }
  
  // Delete from database (cascades to assets and facilities)
  await BluDesignProjectModel.deleteProject(id);
  
  res.json({ success: true, message: 'Project deleted' });
}));

/**
 * GET /api/v1/bludesign/projects/:id/storage-usage
 * Get storage usage for a project
 */
router.get('/:id/storage-usage', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  
  const project = await BluDesignProjectModel.findById(id);
  
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return;
  }
  
  if (project.ownerId !== user.userId) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  
  try {
    const provider = createStorageProvider({
      type: project.storageProvider,
      config: project.storageConfig || { basePath: './storage/bludesign' },
    });
    const bytes = await provider.getProjectStorageUsage(id);
    
    res.json({
      success: true,
      usage: {
        bytes,
        megabytes: Math.round(bytes / 1024 / 1024 * 100) / 100,
        gigabytes: Math.round(bytes / 1024 / 1024 / 1024 * 1000) / 1000,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get storage usage',
      error: error.message,
    });
  }
}));

export { router as bluDesignProjectsRouter };

