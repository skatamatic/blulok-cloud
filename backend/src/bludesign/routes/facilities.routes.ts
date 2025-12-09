/**
 * Facilities Routes
 * 
 * API routes for managing user facilities (save/load).
 */

import { Router, Response } from 'express';
import { FacilityService, FacilityData } from '../services/facility.service';
import { authenticateToken } from '../../middleware/auth.middleware';
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
});

const updateFacilitySchema = Joi.object({
  data: facilityDataSchema.required(),
  thumbnail: Joi.string().optional().allow(null, ''),
});

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

    const { name, data, thumbnail } = value;
    const facility = await getFacilityService().saveFacility(userId, name, data, thumbnail);

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
