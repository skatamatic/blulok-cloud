/**
 * BluDesign Projects Routes
 *
 * API routes for managing BluDesign projects.
 */

import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { BluDesignProjectModel } from '../models/bludesign-project.model';
import { StorageProviderType } from '../types/bludesign.types';
import { createStorageProvider, validateStorageConfig, storageConfigForProject } from '../services/storage';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
} from '@/schemas/bludesign/projects.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/projects';

router.use(authenticateToken as any);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'List all projects for the current user',
    security: 'bearer',
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const projects = await BluDesignProjectModel.findByOwner(user.userId);

    res.json({
      success: true,
      projects,
      total: projects.length,
    });
  }),
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Get a specific project',
    security: 'bearer',
    params: projectIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

    res.json({ success: true, project });
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Create a new project',
    security: 'bearer',
    body: createProjectSchema,
    responses: {
      201: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const value = req.body;

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

    try {
      const provider = createStorageProvider(storageConfigForProject(project));
      await provider.initialize();
      await provider.initializeProject(project.id);
    } catch (storageError: any) {
      await BluDesignProjectModel.deleteProject(project.id);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize project storage',
        error: storageError.message,
      });
      return;
    }

    res.status(201).json({ success: true, project });
  }),
);

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Update a project',
    security: 'bearer',
    params: projectIdParamSchema,
    body: updateProjectSchema,
    responses: {
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const isOwner = await BluDesignProjectModel.isOwner(id, user.userId);
    if (!isOwner) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const value = req.body;

    const project = await BluDesignProjectModel.updateProject(id, value);

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    res.json({ success: true, project });
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Delete a project and all its contents',
    security: 'bearer',
    params: projectIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
      const provider = createStorageProvider(storageConfigForProject(project));
      await provider.deleteProject(id);
    } catch (storageError) {
      console.error('Failed to delete project storage:', storageError);
    }

    await BluDesignProjectModel.deleteProject(id);

    res.json({ success: true, message: 'Project deleted' });
  }),
);

registerGet(
  router,
  '/:id/storage-usage',
  {
    openApiPath: `${MOUNT}/{id}/storage-usage`,
    tags: ['BluDesign'],
    summary: 'Get storage usage for a project',
    security: 'bearer',
    params: projectIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
      const provider = createStorageProvider(storageConfigForProject(project));
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
  }),
);

registerPost(
  router,
  '/:id/storage/test',
  {
    openApiPath: `${MOUNT}/{id}/storage/test`,
    tags: ['BluDesign'],
    summary: 'Test storage provider configuration for a project',
    security: 'bearer',
    params: projectIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
      const config = storageConfigForProject(project);

      const validationErrors = validateStorageConfig(config);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Storage configuration validation failed',
          errors: validationErrors,
        });
        return;
      }

      const provider = createStorageProvider(config);
      await provider.initialize();

      const isHealthy = await provider.healthCheck();

      if (isHealthy) {
        res.json({
          success: true,
          message: 'Storage provider connection successful',
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Storage provider health check failed',
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to test storage provider',
        error: error.message,
      });
    }
  }),
);

export { router as bluDesignProjectsRouter };
