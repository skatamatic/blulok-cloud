/**
 * Facilities Routes
 * 
 * API routes for managing user facilities (save/load).
 */

import { Router, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { FacilityService, FacilityData } from '../services/facility.service';
import { authenticateToken } from '../../middleware/auth.middleware';
import { AppError, NotFoundError } from '../../middleware/error.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { DatabaseService } from '../../services/database.service';
import Joi from 'joi';

const router = Router();

// Lazy-load facility service to ensure DB is initialized
let facilityServiceInstance: FacilityService | null = null;
function getFacilityService(): FacilityService {
  if (!facilityServiceInstance) {
    const db = DatabaseService.getInstance().connection;
    facilityServiceInstance = new FacilityService(db);
  }
  return facilityServiceInstance;
}

// Validation schemas - allow unknown fields to be more flexible
const facilityDataSchema = Joi.object({
  version: Joi.string().required(),
  camera: Joi.object().required(),
  placedObjects: Joi.array().required(),
  gridSize: Joi.number().required(),
  showGrid: Joi.boolean().required(),
}).unknown(true); // Allow additional fields like 'name'

const saveFacilitySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  data: facilityDataSchema.required(),
  thumbnail: Joi.string().optional().allow(null, ''),
  /** When duplicating a facility, copy layout-source.png from this facility id. */
  copyLayoutSourceFrom: Joi.string().uuid().optional(),
  /** When duplicating a facility, copy terrain sidecars from this facility id. */
  copyTerrainFrom: Joi.string().uuid().optional(),
});

const updateFacilitySchema = Joi.object({
  data: facilityDataSchema.required(),
  thumbnail: Joi.string().optional().allow(null, ''),
});

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

/**
 * GET /api/v1/bludesign/facilities
 * List all facilities for the authenticated user
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * GET /api/v1/bludesign/facilities/last
 * Get the last opened facility for the authenticated user
 */
router.get('/last', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * GET /api/v1/bludesign/facilities/:id/layout-source
 * Download the persisted import plan image (PNG).
 */
router.get('/:id/layout-source', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/:id/layout-source
 * Upload the import plan image after facility save.
 */
router.put(
  '/:id/layout-source',
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
  }
);

/**
 * GET /api/v1/bludesign/facilities/terrain-data/:terrainDataId/imagery
 */
router.get('/terrain-data/:terrainDataId/imagery', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/terrain-data/:terrainDataId/imagery
 */
router.put(
  '/terrain-data/:terrainDataId/imagery',
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
  }
);

/**
 * GET /api/v1/bludesign/facilities/terrain-data/:terrainDataId/heightmap
 */
router.get('/terrain-data/:terrainDataId/heightmap', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/terrain-data/:terrainDataId/heightmap
 */
router.put(
  '/terrain-data/:terrainDataId/heightmap',
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
  }
);

/**
 * DELETE /api/v1/bludesign/facilities/terrain-data/:terrainDataId
 */
router.delete(
  '/terrain-data/:terrainDataId',
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
  }
);

/**
 * GET /api/v1/bludesign/facilities/:id/terrain-imagery
 */
router.get('/:id/terrain-imagery', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/:id/terrain-imagery
 */
router.put(
  '/:id/terrain-imagery',
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
  }
);

/**
 * GET /api/v1/bludesign/facilities/:id/terrain-heightmap
 */
router.get('/:id/terrain-heightmap', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/:id/terrain-heightmap
 */
router.put(
  '/:id/terrain-heightmap',
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
  }
);

/**
 * GET /api/v1/bludesign/facilities/:id
 * Get a specific facility
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * POST /api/v1/bludesign/facilities
 * Save a new facility
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

/**
 * PUT /api/v1/bludesign/facilities/:id
 * Update an existing facility
 */
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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

    // Update last_opened as well
    await getFacilityService().updateLastOpened(id, userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating facility:', error);
    res.status(500).json({ error: 'Failed to update facility' });
  }
});

/**
 * DELETE /api/v1/bludesign/facilities/:id
 * Delete a facility
 */
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
});

export default router;
