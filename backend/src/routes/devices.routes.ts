import { Router, Response } from 'express';
import Joi from 'joi';
import { DeviceModel, type DeviceFilters } from '../models/device.model';
import { authenticateToken } from '../middleware/auth.middleware';
import { UserRole } from '../types/auth.types';
import { AuthenticatedRequest } from '../types/auth.types';
import { WebSocketService } from '../services/websocket.service';

const router = Router();
const deviceModel = new DeviceModel();

// Validation schemas
const accessControlDeviceSchema = Joi.object({
  gateway_id: Joi.string().required(),
  name: Joi.string().required(),
  device_type: Joi.string().valid('access_control').required(),
  location_description: Joi.string().required(),
  relay_channel: Joi.number().integer().min(1).max(8).required(),
});

const bluLokDeviceSchema = Joi.object({
  gateway_id: Joi.string().required(),
  name: Joi.string().required(),
  device_type: Joi.string().valid('blulok').required(),
  location_description: Joi.string().required(),
  unit_id: Joi.string().required(),
});

const lockStatusSchema = Joi.object({
  lock_status: Joi.string().valid('locked', 'unlocked', 'error').required(),
});

const deviceStatusSchema = Joi.object({
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').required(),
});

// Simple XSS sanitization function
const sanitizeHtml = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET /api/devices - Get all devices with hierarchy
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { facility_id, device_type, status, search, sortBy, sortOrder, limit, offset } = req.query;

    // Restrict facility access based on user role - FIXED VERSION
    let allowedFacilityId = facility_id as string | undefined;
    
    // For facility-scoped users (TENANT, FACILITY_ADMIN, etc.), enforce facility restrictions
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
      if (facility_id && !user.facilityIds?.includes(facility_id as string)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      // CRITICAL FIX: If no facility specified, restrict to user's facilities
      if (!facility_id) {
        if (user.facilityIds && user.facilityIds.length > 0) {
          allowedFacilityId = user.facilityIds[0]; // Default to first facility
        } else {
          // User has no facility access - return empty result
          res.json({ devices: [], total: 0 });
          return;
        }
      }
    }

    const filters: DeviceFilters = {
      device_type: device_type as any,
      status: status as string,
      search: search as string,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
    };
    
    if (limit) {
      filters.limit = parseInt(limit as string);
    }
    if (offset) {
      filters.offset = parseInt(offset as string);
    }
    if (allowedFacilityId) {
      (filters as any).facility_id = allowedFacilityId;
    }

    let devices: any[] = [];
    let total = 0;

    if (!device_type || device_type === 'all') {
      // Get both types
      const [accessControlDevices, blulokDevices] = await Promise.all([
        deviceModel.findAccessControlDevices(filters),
        deviceModel.findBluLokDevices(filters)
      ]);
      
      devices = [
        ...accessControlDevices.map(d => ({ ...d, device_category: 'access_control' })),
        ...blulokDevices.map(d => ({ ...d, device_category: 'blulok' }))
      ];
      
      // Get total count for both types
      const [accessControlTotal, blulokTotal] = await Promise.all([
        deviceModel.countAccessControlDevices(filters),
        deviceModel.countBluLokDevices(filters)
      ]);
      total = accessControlTotal + blulokTotal;
    } else if (device_type === 'access_control') {
      const accessControlDevices = await deviceModel.findAccessControlDevices(filters);
      devices = accessControlDevices.map(d => ({ ...d, device_category: 'access_control' }));
      total = await deviceModel.countAccessControlDevices(filters);
    } else if (device_type === 'blulok') {
      const blulokDevices = await deviceModel.findBluLokDevices(filters);
      devices = blulokDevices.map(d => ({ ...d, device_category: 'blulok' }));
      total = await deviceModel.countBluLokDevices(filters);
    }

    res.json({ success: true, devices, total });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch devices' });
  }
});

// GET /api/devices/facility/:facilityId/hierarchy - Get facility device hierarchy
router.get('/facility/:facilityId/hierarchy', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const facilityId = req.params.facilityId as string;

    // Check access permissions
    if (user.role === UserRole.FACILITY_ADMIN || user.role === UserRole.TENANT) {
      if (!user.facilityIds?.includes(facilityId)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
    }

    const hierarchy = await deviceModel.getFacilityDeviceHierarchy(String(facilityId));
    
    if (!hierarchy) {
      res.status(404).json({ success: false, message: 'Facility not found' });
      return;
    }

    res.json({ hierarchy });
  } catch (error) {
    console.error('Error fetching facility device hierarchy:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch device hierarchy' });
  }
});

// POST /api/devices/access-control - Create access control device
router.post('/access-control', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    // Validate request body
    const { error, value } = accessControlDeviceSchema.validate(req.body);
    if (error) {
      res.status(400).json({ 
        success: false, 
        message: error.details[0]?.message || 'Validation error',
        error: error.details[0]?.message || 'Validation error'
      });
      return;
    }

    // TODO: Add facility access check for FACILITY_ADMIN

    // Sanitize device name to prevent XSS
    const sanitizedValue = {
      ...value,
      name: sanitizeHtml(value.name),
      location_description: sanitizeHtml(value.location_description)
    };

    const device = await deviceModel.createAccessControlDevice(sanitizedValue);
    
    res.status(201).json({ success: true, device });
  } catch (error) {
    console.error('Error creating access control device:', error);
    res.status(500).json({ success: false, message: 'Failed to create access control device' });
  }
});

// POST /api/devices/blulok - Create BluLok device
router.post('/blulok', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    // Validate request body
    const { error, value } = bluLokDeviceSchema.validate(req.body);
    if (error) {
      res.status(400).json({ 
        success: false, 
        message: error.details[0]?.message || 'Validation error',
        error: error.details[0]?.message || 'Validation error'
      });
      return;
    }

    // TODO: Add facility access check for FACILITY_ADMIN

    // Sanitize device name to prevent XSS
    const sanitizedValue = {
      ...value,
      name: sanitizeHtml(value.name),
      location_description: sanitizeHtml(value.location_description)
    };

    const device = await deviceModel.createBluLokDevice(sanitizedValue);
    
    res.status(201).json({ success: true, device });
  } catch (error) {
    console.error('Error creating BluLok device:', error);
    res.status(500).json({ success: false, message: 'Failed to create BluLok device' });
  }
});

// PUT /api/devices/:deviceType/:id/status - Update device status
router.put('/:deviceType/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const deviceType = req.params.deviceType as 'access_control' | 'blulok';
    const id = req.params.id as string;

    if (deviceType !== 'access_control' && deviceType !== 'blulok') {
      res.status(400).json({ success: false, message: 'Invalid device type' });
      return;
    }

    // Validate request body
    const { error, value } = deviceStatusSchema.validate(req.body);
    if (error) {
      res.status(400).json({ 
        success: false, 
        message: error.details[0]?.message || 'Validation error',
        error: error.details[0]?.message || 'Validation error'
      });
      return;
    }

    // Restrict access for TENANT and MAINTENANCE roles
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    // TODO: Add facility access check

    await deviceModel.updateDeviceStatus(String(id), deviceType as any, value.status);
    
    // Broadcast battery status update if this affects battery levels
    const wsService = WebSocketService.getInstance();
    await wsService.broadcastBatteryStatusUpdate();
    
    res.json({ message: 'Device status updated successfully' });
  } catch (error) {
    console.error('Error updating device status:', error);
    res.status(500).json({ success: false, message: 'Failed to update device status' });
  }
});

// PUT /api/devices/blulok/:id/lock - Update BluLok lock status
router.put('/blulok/:id/lock', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    // Validate request body
    const { error, value } = lockStatusSchema.validate(req.body);
    if (error) {
      res.status(400).json({ 
        success: false, 
        message: error.details[0]?.message || 'Validation error',
        error: error.details[0]?.message || 'Validation error'
      });
      return;
    }

    // Proper access control - users can only control locks for units they have access to
    const { UnitsService } = await import('@/services/units.service');
    const unitsService = UnitsService.getInstance();
    
    // Get the unit ID for this device by querying the blulok_devices table
    const knex = deviceModel['db'].connection;
    const device = await knex('blulok_devices')
      .select('unit_id')
      .where('id', String(id))
      .first();
    
    if (!device || !device.unit_id) {
      res.status(404).json({ success: false, message: 'Device or associated unit not found' });
      return;
    }

    // Check if user has access to the unit
    const hasAccess = await unitsService.hasUserAccessToUnit(device.unit_id, user.userId, user.role);
    if (!hasAccess) {
      res.status(403).json({ success: false, message: 'Insufficient permissions - unit access required' });
      return;
    }

    await deviceModel.updateLockStatus(String(id), value.lock_status);
    
    // Broadcast units update to all subscribers when lock status changes
    const wsService = WebSocketService.getInstance();
    await wsService.broadcastUnitsUpdate();
    
    res.json({ message: 'Lock status updated successfully' });
  } catch (error) {
    console.error('Error updating lock status:', error);
    res.status(500).json({ success: false, message: 'Failed to update lock status' });
  }
});

export { router as devicesRouter };
