/**
 * BluDesign Assets Routes
 *
 * API routes for managing BluDesign assets.
 */

import { Router, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { BluDesignProjectModel } from '../models/bludesign-project.model';
import { BluDesignAssetModel } from '../models/bludesign-asset.model';
import { GeometryType } from '../types/bludesign.types';
import { createStorageProvider, storageConfigForProject } from '../services/storage';
import { AssetService } from '../services/asset.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import { parseQueryBoolean, parseOptionalQueryInt } from '@/utils/query-boolean.util';
import {
  createAssetSchema,
  updateAssetSchema,
  projectAssetParamSchema,
  projectAssetIdParamSchema,
  projectAssetDownloadParamSchema,
  assetDefinitionSchema,
  updateAssetDefinitionSchema,
  materialPresetSchema,
  updateMaterialPresetSchema,
  projectAssetDefinitionIdParamSchema,
  projectAssetDefinitionAssetIdParamSchema,
  projectMaterialPresetParamSchema,
  bluDesignProjectAssetListQuerySchema,
} from '@/schemas/bludesign/assets.schemas';
import {
  customModelProjectParamSchema,
  customModelDeleteParamSchema,
  bluDesignProjectAssetDefinitionListQuerySchema,
} from '@/schemas/bludesign/asset-definitions.schemas';

const router = Router({ mergeParams: true });
const MOUNT = '/api/v1/bludesign/projects/{projectId}/assets';

interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedMimes = [
      'model/gltf-binary',
      'model/gltf+json',
      'application/octet-stream',
      'image/png',
      'image/jpeg',
      'image/webp',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(glb|gltf|fbx|png|jpg|jpeg|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

router.use(authenticateToken as any);

async function checkProjectAccess(
  projectId: string,
  userId: string,
  res: Response
): Promise<boolean> {
  const isOwner = await BluDesignProjectModel.isOwner(projectId, userId);
  if (!isOwner) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return false;
  }
  return true;
}

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'List all assets in a project',
    security: 'bearer',
    params: projectAssetParamSchema,
    query: bluDesignProjectAssetListQuerySchema,
    responses: { 403: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const { category, isSmart, search, limit, offset } = req.query;

    const assets = await BluDesignAssetModel.findByProject(projectId, {
      category: category as import('../types/bludesign.types').AssetCategory | undefined,
      isSmart: parseQueryBoolean(isSmart),
      search: search as string | undefined,
      limit: parseOptionalQueryInt(limit),
      offset: parseOptionalQueryInt(offset),
    });

    const total = await BluDesignAssetModel.countByProject(projectId);

    res.json({
      success: true,
      assets,
      total,
    });
  }),
);

registerGet(
  router,
  '/:assetId',
  {
    openApiPath: `${MOUNT}/{assetId}`,
    tags: ['BluDesign'],
    summary: 'Get a specific asset',
    security: 'bearer',
    params: projectAssetIdParamSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const asset = await BluDesignAssetModel.findById(assetId);

    if (!asset || asset.projectId !== projectId) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    res.json({ success: true, asset });
  }),
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Create a new asset',
    security: 'bearer',
    params: projectAssetParamSchema,
    body: createAssetSchema,
    responses: { 403: errorEnvelopeSchema, 400: errorEnvelopeSchema, 201: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const value = req.body;

    const asset = await BluDesignAssetModel.createAsset(projectId, user.userId, value);

    res.status(201).json({ success: true, asset });
  }),
);

registerPut(
  router,
  '/:assetId',
  {
    openApiPath: `${MOUNT}/{assetId}`,
    tags: ['BluDesign'],
    summary: 'Update an asset',
    security: 'bearer',
    params: projectAssetIdParamSchema,
    body: updateAssetSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const belongsToProject = await BluDesignAssetModel.belongsToProject(assetId, projectId);
    if (!belongsToProject) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    const value = req.body;

    const asset = await BluDesignAssetModel.updateAsset(assetId, value);

    if (!asset) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    res.json({ success: true, asset });
  }),
);

registerDelete(
  router,
  '/:assetId',
  {
    openApiPath: `${MOUNT}/{assetId}`,
    tags: ['BluDesign'],
    summary: 'Delete an asset',
    security: 'bearer',
    params: projectAssetIdParamSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const asset = await BluDesignAssetModel.findById(assetId);

    if (!asset || asset.projectId !== projectId) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    try {
      const project = await BluDesignProjectModel.findById(projectId);
      if (project) {
        const provider = createStorageProvider(storageConfigForProject(project));
        await provider.deleteAssetFiles(projectId, assetId);
      }
    } catch (storageError) {
      console.error('Failed to delete asset storage:', storageError);
    }

    await BluDesignAssetModel.deleteAsset(assetId);

    res.json({ success: true, message: 'Asset deleted' });
  }),
);

registerPost(
  router,
  '/:assetId/upload',
  {
    openApiPath: `${MOUNT}/{assetId}/upload`,
    tags: ['BluDesign'],
    summary: 'Upload asset geometry file',
    security: 'bearer',
    params: projectAssetIdParamSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema, 400: errorEnvelopeSchema, 500: errorEnvelopeSchema },
  },
  upload.single('file'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const belongsToProject = await BluDesignAssetModel.belongsToProject(assetId, projectId);
    if (!belongsToProject) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    const project = await BluDesignProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    try {
      const provider = createStorageProvider(storageConfigForProject(project));

      const storagePath = await provider.uploadAssetFile(
        projectId,
        assetId,
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype
      );

      await BluDesignAssetModel.updateAsset(assetId, {
        geometry: {
          type: GeometryType.GLB,
          source: storagePath,
        },
      });

      res.json({
        success: true,
        message: 'File uploaded',
        path: storagePath,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Upload failed',
        error: error.message,
      });
    }
  }),
);

registerPost(
  router,
  '/:assetId/textures',
  {
    openApiPath: `${MOUNT}/{assetId}/textures`,
    tags: ['BluDesign'],
    summary: 'Upload asset texture',
    security: 'bearer',
    params: projectAssetIdParamSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema, 400: errorEnvelopeSchema, 500: errorEnvelopeSchema },
  },
  upload.single('texture'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId } = req.params;
    const { slotName } = req.body;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const belongsToProject = await BluDesignAssetModel.belongsToProject(assetId, projectId);
    if (!belongsToProject) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    if (!slotName) {
      res.status(400).json({ success: false, message: 'slotName is required' });
      return;
    }

    const project = await BluDesignProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    try {
      const provider = createStorageProvider(storageConfigForProject(project));

      const storagePath = await provider.uploadTexture(
        projectId,
        assetId,
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype
      );

      res.json({
        success: true,
        message: 'Texture uploaded',
        path: storagePath,
        slotName,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Upload failed',
        error: error.message,
      });
    }
  }),
);

registerGet(
  router,
  '/:assetId/download/:filename',
  {
    openApiPath: `${MOUNT}/{assetId}/download/{filename}`,
    tags: ['BluDesign'],
    summary: 'Download asset file',
    security: 'bearer',
    params: projectAssetDownloadParamSchema,
    responses: { 403: errorEnvelopeSchema, 404: errorEnvelopeSchema, 500: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { projectId, assetId, filename } = req.params;

    if (!(await checkProjectAccess(projectId, user.userId, res))) return;

    const belongsToProject = await BluDesignAssetModel.belongsToProject(assetId, projectId);
    if (!belongsToProject) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    const project = await BluDesignProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    try {
      const provider = createStorageProvider(storageConfigForProject(project));

      const data = await provider.downloadAssetFile(projectId, assetId, filename);

      const ext = filename.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        glb: 'model/gltf-binary',
        gltf: 'model/gltf+json',
        fbx: 'application/octet-stream',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };

      res.setHeader('Content-Type', contentTypes[ext || ''] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        res.status(404).json({ success: false, message: 'File not found' });
      } else {
        res.status(500).json({
          success: false,
          message: 'Download failed',
          error: error.message,
        });
      }
    }
  }),
);

registerGet(
  router,
  '/definitions',
  {
    openApiPath: `${MOUNT}/definitions`,
    tags: ['BluDesign'],
    summary: 'List all asset definitions',
    security: 'bearer',
    params: projectAssetParamSchema,
    query: bluDesignProjectAssetDefinitionListQuerySchema,
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { category, isSmart, isBuiltin } = req.query;

    const definitions = await AssetService.getAssetDefinitions({
      category: category as string | undefined,
      isSmart: parseQueryBoolean(isSmart),
      isBuiltin: parseQueryBoolean(isBuiltin),
    });

    res.json({ success: true, data: definitions });
  }),
);

registerGet(
  router,
  '/definitions/:id',
  {
    openApiPath: `${MOUNT}/definitions/{id}`,
    tags: ['BluDesign'],
    summary: 'Get a specific asset definition',
    security: 'bearer',
    params: projectAssetDefinitionIdParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const definition = await AssetService.getAssetDefinition(id);

    if (!definition) {
      res.status(404).json({ success: false, message: 'Asset definition not found' });
      return;
    }

    res.json({ success: true, data: definition });
  }),
);

registerPost(
  router,
  '/definitions',
  {
    openApiPath: `${MOUNT}/definitions`,
    tags: ['BluDesign'],
    summary: 'Create a new asset definition',
    security: 'bearer',
    params: projectAssetParamSchema,
    body: assetDefinitionSchema,
    responses: { 201: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const value = req.body;

    const definition = await AssetService.createAssetDefinition({
      ...value,
      createdBy: req.user?.userId,
    });

    res.status(201).json({ success: true, data: definition });
  }),
);

registerPut(
  router,
  '/definitions/:id',
  {
    openApiPath: `${MOUNT}/definitions/{id}`,
    tags: ['BluDesign'],
    summary: 'Update an asset definition',
    security: 'bearer',
    params: projectAssetDefinitionIdParamSchema,
    body: updateAssetDefinitionSchema,
    responses: { 404: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const value = req.body;

    const definition = await AssetService.updateAssetDefinition(id, value);

    if (!definition) {
      res.status(404).json({ success: false, message: 'Asset definition not found' });
      return;
    }

    res.json({ success: true, data: definition });
  }),
);

registerDelete(
  router,
  '/definitions/:id',
  {
    openApiPath: `${MOUNT}/definitions/{id}`,
    tags: ['BluDesign'],
    summary: 'Delete an asset definition',
    security: 'bearer',
    params: projectAssetDefinitionIdParamSchema,
    responses: { 404: errorEnvelopeSchema, 403: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    try {
      const success = await AssetService.deleteAssetDefinition(id);

      if (!success) {
        res.status(404).json({ success: false, message: 'Asset definition not found' });
        return;
      }

      res.json({ success: true });
    } catch (error: any) {
      if (error.message?.includes('Cannot delete built-in')) {
        res.status(403).json({ success: false, message: error.message });
      } else {
        throw error;
      }
    }
  }),
);

registerGet(
  router,
  '/definitions/:assetId/materials',
  {
    openApiPath: `${MOUNT}/definitions/{assetId}/materials`,
    tags: ['BluDesign'],
    summary: 'Get material presets for an asset',
    security: 'bearer',
    params: projectAssetDefinitionAssetIdParamSchema,
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { assetId } = req.params;

    const presets = await AssetService.getMaterialPresets(assetId);
    res.json({ success: true, data: presets });
  }),
);

registerPost(
  router,
  '/definitions/:assetId/materials',
  {
    openApiPath: `${MOUNT}/definitions/{assetId}/materials`,
    tags: ['BluDesign'],
    summary: 'Create a material preset for an asset',
    security: 'bearer',
    params: projectAssetDefinitionAssetIdParamSchema,
    body: materialPresetSchema,
    responses: { 201: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { assetId } = req.params;
    const value = req.body;

    const preset = await AssetService.createMaterialPreset({
      ...value,
      assetId,
    });

    res.status(201).json({ success: true, data: preset });
  }),
);

registerPut(
  router,
  '/definitions/:assetId/materials/:presetId',
  {
    openApiPath: `${MOUNT}/definitions/{assetId}/materials/{presetId}`,
    tags: ['BluDesign'],
    summary: 'Update a material preset',
    security: 'bearer',
    params: projectMaterialPresetParamSchema,
    body: updateMaterialPresetSchema,
    responses: { 404: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { presetId } = req.params;
    const value = req.body;

    const preset = await AssetService.updateMaterialPreset(presetId, value);

    if (!preset) {
      res.status(404).json({ success: false, message: 'Material preset not found' });
      return;
    }

    res.json({ success: true, data: preset });
  }),
);

registerDelete(
  router,
  '/definitions/:assetId/materials/:presetId',
  {
    openApiPath: `${MOUNT}/definitions/{assetId}/materials/{presetId}`,
    tags: ['BluDesign'],
    summary: 'Delete a material preset',
    security: 'bearer',
    params: projectMaterialPresetParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { presetId } = req.params;

    const success = await AssetService.deleteMaterialPreset(presetId);

    if (!success) {
      res.status(404).json({ success: false, message: 'Material preset not found' });
      return;
    }

    res.json({ success: true });
  }),
);

registerGet(
  router,
  '/models/:projectId',
  {
    openApiPath: `${MOUNT}/models/{projectId}`,
    tags: ['BluDesign'],
    summary: 'List custom models for a project',
    security: 'bearer',
    params: customModelProjectParamSchema,
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;

    const models = await AssetService.getCustomModels(projectId);
    res.json({ success: true, data: models });
  }),
);

registerPost(
  router,
  '/models/:projectId',
  {
    openApiPath: `${MOUNT}/models/{projectId}`,
    tags: ['BluDesign'],
    summary: 'Upload a new custom model',
    security: 'bearer',
    params: customModelProjectParamSchema,
    responses: { 201: errorEnvelopeSchema, 400: errorEnvelopeSchema, 404: errorEnvelopeSchema },
  },
  upload.single('file'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const { projectId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const { name, description, tags } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const formatMap: Record<string, 'gltf' | 'glb' | 'fbx' | 'obj'> = {
      gltf: 'gltf',
      glb: 'glb',
      fbx: 'fbx',
      obj: 'obj',
    };

    const format = formatMap[ext || ''];
    if (!format) {
      res.status(400).json({ success: false, message: 'Unsupported file format' });
      return;
    }

    const project = await BluDesignProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const provider = createStorageProvider(storageConfigForProject(project));

    const modelId = `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const storagePath = await provider.uploadAssetFile(
      projectId,
      modelId,
      file.originalname,
      file.buffer,
      file.mimetype
    );

    const model = await AssetService.createCustomModel({
      projectId,
      name,
      description,
      filename: file.originalname,
      contentType: file.mimetype,
      fileSize: file.size,
      storagePath,
      format,
      tags: tags ? JSON.parse(tags) : undefined,
      uploadedBy: req.user?.userId,
    });

    res.status(201).json({ success: true, data: model });
  }),
);

registerDelete(
  router,
  '/models/:projectId/:modelId',
  {
    openApiPath: `${MOUNT}/models/{projectId}/{modelId}`,
    tags: ['BluDesign'],
    summary: 'Delete a custom model',
    security: 'bearer',
    params: customModelDeleteParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, modelId } = req.params;

    const model = await AssetService.getCustomModel(modelId);
    if (!model || model.projectId !== projectId) {
      res.status(404).json({ success: false, message: 'Model not found' });
      return;
    }

    const project = await BluDesignProjectModel.findById(projectId);
    if (project) {
      try {
        const provider = createStorageProvider(storageConfigForProject(project));
        const pathParts = model.storagePath.split('/');
        const modelAssetId = pathParts.length > 2 ? pathParts[pathParts.length - 2] : modelId;
        await provider.deleteAssetFiles(projectId, modelAssetId);
      } catch {
        // Ignore storage errors, continue with DB deletion
      }
    }

    await AssetService.deleteCustomModel(modelId);

    res.json({ success: true });
  }),
);

export { router as bluDesignAssetsRouter };
