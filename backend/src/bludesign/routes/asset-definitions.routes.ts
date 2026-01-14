/**
 * BluDesign Asset Definitions Routes
 * 
 * Global asset library routes for asset definitions, material presets, and custom models.
 * These are independent of projects.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import multer, { FileFilterCallback } from 'multer';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { AssetService } from '../services/asset.service';
import { BluDesignProjectModel } from '../models/bludesign-project.model';
import { AssetCategory } from '../types/bludesign.types';
import { createStorageProvider } from '../services/storage';

const router = Router();

// Extend AuthenticatedRequest to include multer file
interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
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

// Validation schemas for asset definitions
const assetDefinitionSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  category: Joi.string().valid(...Object.values(AssetCategory)).required(),
  modelType: Joi.string().valid('primitive', 'gltf', 'glb', 'custom').required(),
  customModelId: Joi.string().uuid().optional(),
  primitiveSpec: Joi.object({
    type: Joi.string().valid('box', 'cylinder', 'plane', 'custom').required(),
    params: Joi.object().optional(),
  }).optional(),
  dimensions: Joi.object({
    width: Joi.number().positive().required(),
    height: Joi.number().positive().required(),
    depth: Joi.number().positive().required(),
  }).required(),
  gridUnits: Joi.object({
    x: Joi.number().integer().positive().required(),
    z: Joi.number().integer().positive().required(),
  }).required(),
  isSmart: Joi.boolean().optional(),
  canRotate: Joi.boolean().optional(),
  canStack: Joi.boolean().optional(),
  bindingContract: Joi.object({
    entityType: Joi.string().required(),
    requiredFields: Joi.array().items(Joi.string()).required(),
    stateField: Joi.string().optional(),
    stateValues: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  defaultMaterials: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      color: Joi.string().optional(),
      metalness: Joi.number().min(0).max(1).optional(),
      roughness: Joi.number().min(0).max(1).optional(),
      emissive: Joi.string().optional(),
      emissiveIntensity: Joi.number().min(0).optional(),
      transparent: Joi.boolean().optional(),
      opacity: Joi.number().min(0).max(1).optional(),
    })
  ).optional(),
  lockerSpec: Joi.object({
    doorSide: Joi.string().valid('front', 'back', 'left', 'right').required(),
    doorWidth: Joi.number().positive().required(),
    doorHeight: Joi.number().positive().required(),
    doorPositionX: Joi.number().required(), // Can be negative
    doorPositionY: Joi.number().min(0).required(),
  }).optional(),
  thumbnail: Joi.string().optional(),
});

const materialPresetSchema = Joi.object({
  presetName: Joi.string().min(1).max(100).required(),
  partName: Joi.string().min(1).max(100).required(),
  materialConfig: Joi.object({
    color: Joi.string().optional(),
    metalness: Joi.number().min(0).max(1).optional(),
    roughness: Joi.number().min(0).max(1).optional(),
    emissive: Joi.string().optional(),
    emissiveIntensity: Joi.number().min(0).optional(),
    transparent: Joi.boolean().optional(),
    opacity: Joi.number().min(0).max(1).optional(),
  }).required(),
  textureId: Joi.string().uuid().optional(),
  stateBinding: Joi.string().max(50).optional(),
  sortOrder: Joi.number().integer().min(0).optional(),
});

// Apply authentication to all routes
router.use(authenticateToken as any);

// ========================================================================
// Asset Definitions
// ========================================================================

/**
 * GET /definitions
 * List all asset definitions
 */
router.get('/definitions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { category, isSmart, isBuiltin } = req.query;
  
  const definitions = await AssetService.getAssetDefinitions({
    category: category as string | undefined,
    isSmart: isSmart === 'true' ? true : isSmart === 'false' ? false : undefined,
    isBuiltin: isBuiltin === 'true' ? true : isBuiltin === 'false' ? false : undefined,
  });
  
  res.json({ success: true, data: definitions });
}));

/**
 * GET /definitions/:id
 * Get a specific asset definition
 */
router.get('/definitions/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const definition = await AssetService.getAssetDefinition(id);
  
  if (!definition) {
    res.status(404).json({ success: false, message: 'Asset definition not found' });
    return;
  }
  
  res.json({ success: true, data: definition });
}));

/**
 * POST /definitions
 * Create a new asset definition
 */
router.post('/definitions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { error, value } = assetDefinitionSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0].message });
    return;
  }
  
  const definition = await AssetService.createAssetDefinition({
    ...value,
    createdBy: req.user?.userId,
  });
  
  res.status(201).json({ success: true, data: definition });
}));

/**
 * PUT /definitions/:id
 * Update an asset definition
 */
router.put('/definitions/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  // Allow partial updates
  const { error, value } = assetDefinitionSchema.fork(
    ['name', 'category', 'modelType', 'dimensions', 'gridUnits'],
    (schema) => schema.optional()
  ).validate(req.body);
  
  if (error) {
    res.status(400).json({ success: false, message: error.details[0].message });
    return;
  }
  
  const definition = await AssetService.updateAssetDefinition(id, value);
  
  if (!definition) {
    res.status(404).json({ success: false, message: 'Asset definition not found' });
    return;
  }
  
  res.json({ success: true, data: definition });
}));

/**
 * DELETE /definitions/:id
 * Delete an asset definition
 */
router.delete('/definitions/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
}));

// ========================================================================
// Material Presets
// ========================================================================

/**
 * GET /definitions/:assetId/materials
 * Get material presets for an asset
 */
router.get('/definitions/:assetId/materials', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { assetId } = req.params;
  
  const presets = await AssetService.getMaterialPresets(assetId);
  res.json({ success: true, data: presets });
}));

/**
 * POST /definitions/:assetId/materials
 * Create a material preset for an asset
 */
router.post('/definitions/:assetId/materials', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { assetId } = req.params;
  
  const { error, value } = materialPresetSchema.validate(req.body);
  if (error) {
    res.status(400).json({ success: false, message: error.details[0].message });
    return;
  }
  
  const preset = await AssetService.createMaterialPreset({
    ...value,
    assetId,
  });
  
  res.status(201).json({ success: true, data: preset });
}));

/**
 * PUT /definitions/:assetId/materials/:presetId
 * Update a material preset
 */
router.put('/definitions/:assetId/materials/:presetId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { presetId } = req.params;
  
  const { error, value } = materialPresetSchema.fork(
    ['presetName', 'partName', 'materialConfig'],
    (schema) => schema.optional()
  ).validate(req.body);
  
  if (error) {
    res.status(400).json({ success: false, message: error.details[0].message });
    return;
  }
  
  const preset = await AssetService.updateMaterialPreset(presetId, value);
  
  if (!preset) {
    res.status(404).json({ success: false, message: 'Material preset not found' });
    return;
  }
  
  res.json({ success: true, data: preset });
}));

/**
 * DELETE /definitions/:assetId/materials/:presetId
 * Delete a material preset
 */
router.delete('/definitions/:assetId/materials/:presetId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { presetId } = req.params;
  
  const success = await AssetService.deleteMaterialPreset(presetId);
  
  if (!success) {
    res.status(404).json({ success: false, message: 'Material preset not found' });
    return;
  }
  
  res.json({ success: true });
}));

// ========================================================================
// Custom Models
// ========================================================================

/**
 * GET /models/:projectId
 * List custom models for a project
 */
router.get('/models/:projectId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  
  const models = await AssetService.getCustomModels(projectId);
  res.json({ success: true, data: models });
}));

/**
 * POST /models/:projectId
 * Upload a new custom model
 */
router.post('/models/:projectId', upload.single('file'), asyncHandler(async (req: MulterRequest, res: Response) => {
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
  
  // Determine format from filename
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
  
  // Get project for storage provider
  const project = await BluDesignProjectModel.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return;
  }
  
  // Save file using storage provider
  const provider = createStorageProvider({
    type: project.storageProvider,
    config: project.storageConfig || { basePath: './storage/bludesign' },
  });
  
  // Use a unique ID for the model
  const modelId = `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const storagePath = await provider.uploadAssetFile(
    projectId, 
    modelId, 
    file.originalname, 
    file.buffer, 
    file.mimetype
  );
  
  // Create database record
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
}));

/**
 * DELETE /models/:projectId/:modelId
 * Delete a custom model
 */
router.delete('/models/:projectId/:modelId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { projectId, modelId } = req.params;
  
  const model = await AssetService.getCustomModel(modelId);
  if (!model || model.projectId !== projectId) {
    res.status(404).json({ success: false, message: 'Model not found' });
    return;
  }
  
  // Get project for storage provider
  const project = await BluDesignProjectModel.findById(projectId);
  if (project) {
    try {
      const provider = createStorageProvider({
        type: project.storageProvider,
        config: project.storageConfig || { basePath: './storage/bludesign' },
      });
      // Extract the model ID from the storage path to delete the asset files
      const pathParts = model.storagePath.split('/');
      const modelAssetId = pathParts.length > 2 ? pathParts[pathParts.length - 2] : modelId;
      await provider.deleteAssetFiles(projectId, modelAssetId);
    } catch {
      // Ignore storage errors, continue with DB deletion
    }
  }
  
  await AssetService.deleteCustomModel(modelId);
  
  res.json({ success: true });
}));

export { router as bluDesignAssetDefinitionsRouter };

