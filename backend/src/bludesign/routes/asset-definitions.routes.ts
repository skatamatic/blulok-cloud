/**
 * BluDesign Asset Definitions Routes
 *
 * Global asset library routes for asset definitions, material presets, and custom models.
 * These are independent of projects.
 */

import { Router, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { AssetService } from '../services/asset.service';
import { FacilityService } from '../services/facility.service';
import { DatabaseService } from '@/services/database.service';
import { BluDesignProjectModel } from '../models/bludesign-project.model';
import { createStorageProvider, getBluDesignStorageProvider, storageConfigForProject } from '../services/storage';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import { parseQueryBoolean } from '@/utils/query-boolean.util';
import {
  assetDefinitionSchema,
  updateAssetDefinitionSchema,
  materialPresetSchema,
  updateMaterialPresetSchema,
  assetDefinitionIdParamSchema,
  assetDefinitionAssetIdParamSchema,
  materialPresetParamSchema,
  customModelProjectParamSchema,
  customModelDeleteParamSchema,
  globalModelIdParamSchema,
  bluDesignGlobalAssetDefinitionListQuerySchema,
} from '@/schemas/bludesign/asset-definitions.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/assets';

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

registerGet(
  router,
  '/definitions',
  {
    openApiPath: `${MOUNT}/definitions`,
    tags: ['BluDesign'],
    summary: 'List all asset definitions',
    security: 'bearer',
    query: bluDesignGlobalAssetDefinitionListQuerySchema,
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
    params: assetDefinitionIdParamSchema,
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
    params: assetDefinitionIdParamSchema,
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

registerGet(
  router,
  '/definitions/:id/facilities',
  {
    openApiPath: `${MOUNT}/definitions/{id}/facilities`,
    tags: ['BluDesign'],
    summary: 'List facilities referencing an asset definition',
    security: 'bearer',
    params: assetDefinitionIdParamSchema,
    responses: { 401: errorEnvelopeSchema, 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const definition = await AssetService.getAssetDefinition(id);
    if (!definition) {
      res.status(404).json({ success: false, message: 'Asset definition not found' });
      return;
    }

    const facilityService = new FacilityService(DatabaseService.getInstance().connection);
    const facilities = await facilityService.listFacilitiesUsingAsset(userId, id);

    res.json({ success: true, data: facilities });
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
    params: assetDefinitionIdParamSchema,
    responses: { 404: errorEnvelopeSchema, 403: errorEnvelopeSchema, 409: errorEnvelopeSchema },
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
      } else if (error.message?.includes('Cannot delete asset: used by')) {
        res.status(409).json({ success: false, message: error.message });
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
    params: assetDefinitionAssetIdParamSchema,
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
    params: assetDefinitionAssetIdParamSchema,
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
    params: materialPresetParamSchema,
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
    params: materialPresetParamSchema,
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

registerGet(
  router,
  '/global-models',
  {
    openApiPath: `${MOUNT}/global-models`,
    tags: ['BluDesign'],
    summary: 'Get all global models',
    security: 'bearer',
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const models = await AssetService.getGlobalModels();
    res.json({ success: true, data: models });
  }),
);

registerGet(
  router,
  '/global-models/:id',
  {
    openApiPath: `${MOUNT}/global-models/{id}`,
    tags: ['BluDesign'],
    summary: 'Get a specific global model',
    security: 'bearer',
    params: globalModelIdParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const model = await AssetService.getGlobalModel(id);
    if (!model) {
      res.status(404).json({ success: false, message: 'Global model not found' });
      return;
    }

    res.json({ success: true, data: model });
  }),
);

registerGet(
  router,
  '/global-models/:id/file',
  {
    openApiPath: `${MOUNT}/global-models/{id}/file`,
    tags: ['BluDesign'],
    summary: 'Download a global model file',
    security: 'bearer',
    params: globalModelIdParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const model = await AssetService.getGlobalModel(id);
    if (!model) {
      res.status(404).json({ success: false, message: 'Global model not found' });
      return;
    }

    const provider = await getBluDesignStorageProvider();

    try {
      const data = await provider.downloadGlobalAsset(id, model.filename);

      res.setHeader('Content-Type', model.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${model.filename}"`);
      res.send(data);
    } catch {
      res.status(404).json({ success: false, message: 'Model file not found' });
    }
  }),
);

registerPost(
  router,
  '/global-models',
  {
    openApiPath: `${MOUNT}/global-models`,
    tags: ['BluDesign'],
    summary: 'Upload a new global model',
    security: 'bearer',
    responses: { 201: errorEnvelopeSchema, 400: errorEnvelopeSchema },
  },
  upload.single('file'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const { name, description, tags } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const ext = file.originalname.toLowerCase().split('.').pop();
    const formatMap: Record<string, 'gltf' | 'glb' | 'fbx' | 'obj'> = {
      glb: 'glb',
      gltf: 'gltf',
      fbx: 'fbx',
      obj: 'obj',
    };

    const format = formatMap[ext || ''];
    if (!format) {
      res.status(400).json({ success: false, message: 'Unsupported file format' });
      return;
    }

    const provider = await getBluDesignStorageProvider();

    const { v4: uuidv4 } = await import('uuid');
    const modelId = uuidv4();
    const storagePath = await provider.uploadGlobalAsset(
      modelId,
      file.originalname,
      file.buffer,
      file.mimetype
    );

    const model = await AssetService.createGlobalModel({
      id: modelId,
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
  '/global-models/:id',
  {
    openApiPath: `${MOUNT}/global-models/{id}`,
    tags: ['BluDesign'],
    summary: 'Delete a global model',
    security: 'bearer',
    params: globalModelIdParamSchema,
    responses: { 404: errorEnvelopeSchema },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const model = await AssetService.getGlobalModel(id);
    if (!model) {
      res.status(404).json({ success: false, message: 'Global model not found' });
      return;
    }

    const provider = await getBluDesignStorageProvider();

    try {
      await provider.deleteGlobalAsset(id);
    } catch {
      // Ignore storage errors, continue with DB deletion
    }

    await AssetService.deleteGlobalModel(id);

    res.json({ success: true });
  }),
);

export { router as bluDesignAssetDefinitionsRouter };
