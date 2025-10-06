import { Router, Response } from 'express';
import { FacilityModel } from '../models/facility.model';
// import { GatewayModel } from '../models/gateway.model';
import { DeviceModel } from '../models/device.model';
import { authenticateToken } from '../middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';

const router = Router();
const facilityModel = new FacilityModel();
// Removed unused gatewayModel
const deviceModel = new DeviceModel();

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET /api/facilities - Get all facilities (with filtering for admins)
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { search, status, sortBy, sortOrder, limit, offset, user_id } = req.query;

    let facilityIds: string[] | undefined;

    // Restrict facility access based on user role
    if (user.role === UserRole.FACILITY_ADMIN) {
      facilityIds = user.facilityIds;
    } else if (user.role === UserRole.TENANT) {
      facilityIds = user.facilityIds;
    } else if (user.role === UserRole.MAINTENANCE) {
      facilityIds = user.facilityIds;
    }
    // ADMIN and DEV_ADMIN can see all facilities

    if (facilityIds && facilityIds.length === 0) {
      res.json({ facilities: [], total: 0 });
      return;
    }

    const filters = {
      search: search as string,
      status: status as string,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      user_id: user_id as string,
    };

    let result = await facilityModel.findAll(filters);

    // Filter by facility IDs if user has restricted access
    if (facilityIds) {
      result.facilities = result.facilities.filter(f => facilityIds!.includes(f.id));
      result.total = result.facilities.length;
    }

    // Filter by user if user_id is provided
    if (user_id) {
      const { UserFacilityAssociationModel } = await import('../models/user-facility-association.model');
      const userFacilityIds = await UserFacilityAssociationModel.getUserFacilityIds(user_id as string);
      result.facilities = result.facilities.filter(f => userFacilityIds.includes(f.id));
      result.total = result.facilities.length;
    }

    // Get stats for each facility
    const facilitiesWithStats = await Promise.all(
      result.facilities.map(async (facility) => {
        const stats = await facilityModel.getFacilityStats(facility.id);
        return { ...facility, stats };
      })
    );

    res.json({ success: true, facilities: facilitiesWithStats, total: result.total });
  } catch (error) {
    console.error('Error fetching facilities:', error);
    res.status(500).json({ error: 'Failed to fetch facilities' });
  }
});

// GET /api/facilities/:id - Get specific facility
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    // Check access permissions
    if (user.role === UserRole.FACILITY_ADMIN || user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      if (!user.facilityIds?.includes(id)) {
        res.status(403).json({ error: 'Access denied to this facility' });
        return;
      }
    }

    const facility = await facilityModel.findById(String(id));
    if (!facility) {
      res.status(404).json({ error: 'Facility not found' });
      return;
    }

    const stats = await facilityModel.getFacilityStats(String(id));
    const deviceHierarchy = await deviceModel.getFacilityDeviceHierarchy(String(id));

    res.json({ 
      success: true,
      facility: { ...facility, stats },
      deviceHierarchy
    });
  } catch (error) {
    console.error('Error fetching facility:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch facility' });
  }
});

// POST /api/facilities - Create new facility (Admin only)
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const facilityData = req.body;
    const facility = await facilityModel.create(facilityData);
    
    res.status(201).json({ success: true, facility });
  } catch (error) {
    console.error('Error creating facility:', error);
    res.status(500).json({ success: false, message: 'Failed to create facility' });
  }
});

// PUT /api/facilities/:id - Update facility
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    // Check permissions
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(id)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
    } else if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    const facilityData = req.body;
    const facility = await facilityModel.update(String(id), facilityData);
    
    if (!facility) {
      res.status(404).json({ success: false, message: 'Facility not found' });
      return;
    }

    res.json({ success: true, facility });
  } catch (error) {
    console.error('Error updating facility:', error);
    res.status(500).json({ success: false, message: 'Failed to update facility' });
  }
});

// DELETE /api/facilities/:id - Delete facility (Admin only)
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const id = req.params.id as string;
    const deleted = await facilityModel.delete(String(id));
    
    if (!deleted) {
      res.status(404).json({ error: 'Facility not found' });
      return;
    }

    res.json({ message: 'Facility deleted successfully' });
  } catch (error) {
    console.error('Error deleting facility:', error);
    res.status(500).json({ error: 'Failed to delete facility' });
  }
});

export { router as facilitiesRouter };
