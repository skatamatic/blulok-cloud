/**
 * Facilities Routes
 *
 * API routes for managing user facilities (save/load).
 */

import { Router, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { FacilityService } from '../services/facility.service';
import { authenticateToken } from '../../middleware/auth.middleware';
import { AppError, NotFoundError } from '../../middleware/error.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { DatabaseService } from '../../services/database.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import {
  saveFacilitySchema,
  updateFacilitySchema,
  facilityIdParamSchema,
  terrainDataIdParamSchema,
} from '@/schemas/bludesign/facilities.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/facilities';

let facilityServiceInstance: FacilityService | null = null;
function getFacilityService(): FacilityService {
  if (!facilityServiceInstance) {
    const db = DatabaseService.getInstance().connection;
    facilityServiceInstance = new FacilityService(db);
  }
  return facilityServiceInstance;
}

const LAYOUT_SOURCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

const layoutUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    const ok =
      LAYOUT_SOURCE_MIMES.includes(file.mimetype) ||
      /\.(png|jpe?g|webp)$/i.test(file.originalname);
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Upload PNG, JPEG, or WEBP.'));
    }
  },
});

function layoutSourceStatus(error: unknown): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof AppError) return error.statusCode;
  if (error instanceof Error && /not.?found/i.test(error.message)) return 404;
  return 500;
}

function handleLayoutUpload(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  layoutUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 25 MB.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

const TERRAIN_IMAGERY_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const TERRAIN_HEIGHTMAP_MIMES = ['image/png'];

const terrainImageryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    const ok =
      TERRAIN_IMAGERY_MIMES.includes(file.mimetype) ||
      /\.(jpe?g|png|webp)$/i.test(file.originalname);
    cb(null, ok);
  },
});

const terrainHeightmapUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    const ok =
      TERRAIN_HEIGHTMAP_MIMES.includes(file.mimetype) ||
      /\.png$/i.test(file.originalname);
    cb(null, ok);
  },
});

function handleTerrainImageryUpload(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  terrainImageryUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 25 MB.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

function handleTerrainHeightmapUpload(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  terrainHeightmapUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 25 MB.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'List all facilities for the authenticated user',
    security: 'bearer',
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const facilities = await getFacilityService().getUserFacilities(userId);
      res.json(facilities);
    } catch (error) {
      console.error('Error fetching facilities:', error);
      res.status(500).json({ error: 'Failed to fetch facilities' });
    }
  },
);

registerGet(
  router,
  '/last',
  {
    openApiPath: `${MOUNT}/last`,
    tags: ['BluDesign'],
    summary: 'Get the last opened facility for the authenticated user',
    security: 'bearer',
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const facility = await getFacilityService().getLastOpened(userId);

      if (!facility) {
        return res.status(404).json({ error: 'No facility found' });
      }

      res.json(facility);
    } catch (error) {
      console.error('Error fetching last facility:', error);
      res.status(500).json({ error: 'Failed to fetch last facility' });
    }
  },
);

registerGet(
  router,
  '/:id/layout-source',
  {
    openApiPath: `${MOUNT}/{id}/layout-source`,
    tags: ['BluDesign'],
    summary: 'Download the persisted import plan image',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const buffer = await getFacilityService().loadLayoutSource(id, userId);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error fetching layout source:', error);
      res.status(status).json({
        error:
          status === 404
            ? 'Layout source not found'
            : 'Failed to fetch layout source',
      });
    }
  },
);

registerPut(
  router,
  '/:id/layout-source',
  {
    openApiPath: `${MOUNT}/{id}/layout-source`,
    tags: ['BluDesign'],
    summary: 'Upload the import plan image after facility save',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  handleLayoutUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { id } = req.params;
      await getFacilityService().saveLayoutSource(id, userId, req.file.buffer);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error saving layout source:', error);
      res.status(status).json({
        error:
          status === 404
            ? 'Facility not found'
            : status === 400
              ? (error as Error).message
              : 'Failed to save layout source',
      });
    }
  },
);

registerGet(
  router,
  '/terrain-data/:terrainDataId/imagery',
  {
    openApiPath: `${MOUNT}/terrain-data/{terrainDataId}/imagery`,
    tags: ['BluDesign'],
    summary: 'Download terrain data imagery',
    security: 'bearer',
    params: terrainDataIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { terrainDataId } = req.params;
      const buffer = await getFacilityService().loadTerrainDataImagery(terrainDataId, userId);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error fetching terrain imagery:', error);
      res.status(status).json({
        error: status === 404 ? 'Terrain imagery not found' : 'Failed to fetch terrain imagery',
      });
    }
  },
);

registerPut(
  router,
  '/terrain-data/:terrainDataId/imagery',
  {
    openApiPath: `${MOUNT}/terrain-data/{terrainDataId}/imagery`,
    tags: ['BluDesign'],
    summary: 'Upload terrain data imagery',
    security: 'bearer',
    params: terrainDataIdParamSchema,
  },
  authenticateToken,
  handleTerrainImageryUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { terrainDataId } = req.params;
      await getFacilityService().saveTerrainDataImagery(terrainDataId, userId, req.file.buffer);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error saving terrain imagery:', error);
      res.status(status).json({
        error: status === 400 ? (error as Error).message : 'Failed to save terrain imagery',
      });
    }
  },
);

registerGet(
  router,
  '/terrain-data/:terrainDataId/heightmap',
  {
    openApiPath: `${MOUNT}/terrain-data/{terrainDataId}/heightmap`,
    tags: ['BluDesign'],
    summary: 'Download terrain data heightmap',
    security: 'bearer',
    params: terrainDataIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { terrainDataId } = req.params;
      const buffer = await getFacilityService().loadTerrainDataHeightmap(terrainDataId, userId);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error fetching terrain heightmap:', error);
      res.status(status).json({
        error: status === 404 ? 'Terrain heightmap not found' : 'Failed to fetch terrain heightmap',
      });
    }
  },
);

registerPut(
  router,
  '/terrain-data/:terrainDataId/heightmap',
  {
    openApiPath: `${MOUNT}/terrain-data/{terrainDataId}/heightmap`,
    tags: ['BluDesign'],
    summary: 'Upload terrain data heightmap',
    security: 'bearer',
    params: terrainDataIdParamSchema,
  },
  authenticateToken,
  handleTerrainHeightmapUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { terrainDataId } = req.params;
      await getFacilityService().saveTerrainDataHeightmap(terrainDataId, userId, req.file.buffer);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error saving terrain heightmap:', error);
      res.status(status).json({
        error: status === 400 ? (error as Error).message : 'Failed to save terrain heightmap',
      });
    }
  },
);

registerDelete(
  router,
  '/terrain-data/:terrainDataId',
  {
    openApiPath: `${MOUNT}/terrain-data/{terrainDataId}`,
    tags: ['BluDesign'],
    summary: 'Delete terrain data',
    security: 'bearer',
    params: terrainDataIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { terrainDataId } = req.params;
      await getFacilityService().deleteTerrainData(terrainDataId, userId);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error deleting terrain data:', error);
      res.status(status).json({
        error: status === 400 ? (error as Error).message : 'Failed to delete terrain data',
      });
    }
  },
);

registerGet(
  router,
  '/:id/terrain-imagery',
  {
    openApiPath: `${MOUNT}/{id}/terrain-imagery`,
    tags: ['BluDesign'],
    summary: 'Download facility terrain imagery',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const buffer = await getFacilityService().loadTerrainImagery(id, userId);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error fetching terrain imagery:', error);
      res.status(status).json({
        error: status === 404 ? 'Terrain imagery not found' : 'Failed to fetch terrain imagery',
      });
    }
  },
);

registerPut(
  router,
  '/:id/terrain-imagery',
  {
    openApiPath: `${MOUNT}/{id}/terrain-imagery`,
    tags: ['BluDesign'],
    summary: 'Upload facility terrain imagery',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  handleTerrainImageryUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { id } = req.params;
      await getFacilityService().saveTerrainImagery(id, userId, req.file.buffer);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error saving terrain imagery:', error);
      res.status(status).json({
        error:
          status === 404
            ? 'Facility not found'
            : status === 400
              ? (error as Error).message
              : 'Failed to save terrain imagery',
      });
    }
  },
);

registerGet(
  router,
  '/:id/terrain-heightmap',
  {
    openApiPath: `${MOUNT}/{id}/terrain-heightmap`,
    tags: ['BluDesign'],
    summary: 'Download facility terrain heightmap',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const buffer = await getFacilityService().loadTerrainHeightmap(id, userId);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error fetching terrain heightmap:', error);
      res.status(status).json({
        error: status === 404 ? 'Terrain heightmap not found' : 'Failed to fetch terrain heightmap',
      });
    }
  },
);

registerPut(
  router,
  '/:id/terrain-heightmap',
  {
    openApiPath: `${MOUNT}/{id}/terrain-heightmap`,
    tags: ['BluDesign'],
    summary: 'Upload facility terrain heightmap',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  handleTerrainHeightmapUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { id } = req.params;
      await getFacilityService().saveTerrainHeightmap(id, userId, req.file.buffer);
      res.json({ success: true });
    } catch (error) {
      const status = layoutSourceStatus(error);
      if (status >= 500) console.error('Error saving terrain heightmap:', error);
      res.status(status).json({
        error:
          status === 404
            ? 'Facility not found'
            : status === 400
              ? (error as Error).message
              : 'Failed to save terrain heightmap',
      });
    }
  },
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Get a specific facility',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const facility = await getFacilityService().getFacility(id, userId);

      if (!facility) {
        return res.status(404).json({ error: 'Facility not found' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      res.json(facility);
    } catch (error) {
      console.error('Error fetching facility:', error);
      res.status(500).json({ error: 'Failed to fetch facility' });
    }
  },
);

registerPost(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['BluDesign'],
    summary: 'Save a new facility',
    security: 'bearer',
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { error, value } = saveFacilitySchema.validate(req.body);
      if (error) {
        console.error('Facility save validation error:', error.details[0].message);
        console.error('Request body keys:', Object.keys(req.body || {}));
        console.error('Data keys:', Object.keys(req.body?.data || {}));
        return res.status(400).json({ error: error.details[0].message });
      }

      const { name, data, thumbnail, copyLayoutSourceFrom, copyTerrainFrom } = value;
      const facility = await getFacilityService().saveFacility(
        userId,
        name,
        data,
        thumbnail,
        copyLayoutSourceFrom,
        copyTerrainFrom,
      );

      res.status(201).json(facility);
    } catch (error) {
      console.error('Error saving facility:', error);
      res.status(500).json({ error: 'Failed to save facility' });
    }
  },
);

registerPut(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Update an existing facility',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { error, value } = updateFacilitySchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { data, thumbnail } = value;
      await getFacilityService().updateFacility(id, userId, data, thumbnail);

      await getFacilityService().updateLastOpened(id, userId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating facility:', error);
      res.status(500).json({ error: 'Failed to update facility' });
    }
  },
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['BluDesign'],
    summary: 'Delete a facility',
    security: 'bearer',
    params: facilityIdParamSchema,
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      await getFacilityService().deleteFacility(id, userId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting facility:', error);
      res.status(500).json({ error: 'Failed to delete facility' });
    }
  },
);

export default router;
