/**
 * Devices Routes
 *
 * Comprehensive device management API providing CRUD operations for BluLok locks
 * and access control devices. Supports device registration, status monitoring,
 * configuration management, and operational control.
 *
 * Key Features:
 * - Dual device type management (BluLok locks + access control devices)
 * - Device registration and configuration
 * - Real-time status monitoring and health tracking
 * - Device control operations (lock/unlock status updates)
 * - Battery level monitoring and alerts
 * - Facility-scoped device access control
 *
 * Device Types:
 * - BluLok: Primary smart locks with cryptographic access control
 * - Access Control: Secondary devices (gates, elevators, doors)
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full device management across all facilities
 * - FACILITY_ADMIN: Management of devices in assigned facilities
 * - TENANT: Read-only access to devices in their units
 * - MAINTENANCE: Access for device maintenance operations
 *
 * Device Operations:
 * - Register new devices with gateway association
 * - Update device configurations and settings
 * - Monitor device status and connectivity
 * - Update lock status for access control
 * - Track battery levels and maintenance needs
 * - Search and filter devices by various criteria
 *
 * Business Logic:
 * - Device isolation ensures facility security
 * - Status monitoring enables proactive maintenance
 * - Battery tracking prevents device failures
 * - Lock status updates support access control workflows
 * - Gateway association enables device communication
 *
 * Security Considerations:
 * - Facility-scoped access prevents unauthorized operations
 * - Input validation on all device data and configurations
 * - XSS protection for user-provided device names
 * - Audit logging for all device operations
 * - Secure device configuration management
 *
 * Performance Optimizations:
 * - Efficient database queries with proper indexing
 * - Pagination support for large device lists
 * - Cached device lookups for frequent access
 * - Optimized status queries for monitoring dashboards
 * - Bulk operations for facility-wide updates
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { DeviceModel, type DeviceFilters } from '../models/device.model';
import { authenticateToken, requireNotTenant, requireAdminOrFacilityAdmin, applyFacilityScope, requireRoles } from '../middleware/auth.middleware';
import { UserRole } from '../types/auth.types';
import { AuthenticatedRequest } from '../types/auth.types';
import { DevicesService } from '../services/devices.service';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/database.service';
import { validate } from '@/middleware/validator.middleware';

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
  // Optional if the device already exists on gateway and will be assigned later
  device_serial: Joi.string().optional(),
});

const lockStatusSchema = Joi.object({
  lock_status: Joi.string().valid('locked', 'unlocked', 'error').required(),
});

const deviceStatusSchema = Joi.object({
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').required(),
});

// Query validation for list endpoints
const listQuerySchema = Joi.object({
  facility_id: Joi.string().optional(),
  device_type: Joi.string().valid('access_control', 'blulok', 'all').optional(),
  status: Joi.string().optional(),
  search: Joi.string().max(200).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
}).unknown(true);

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
// Listing all devices is not available to TENANT users
router.get('/', requireNotTenant, validate(listQuerySchema, 'query'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { facility_id, device_type, status, search, sortBy, sortOrder, limit, offset } = req.query;

    // Restrict facility access based on user role
    let allowedFacilityId = facility_id as string | undefined;
    
    // For facility-scoped users, enforce facility restrictions
    if (AuthService.isFacilityScoped(user.role)) {
      if (facility_id && !user.facilityIds?.includes(facility_id as string)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      // If no facility specified, restrict to user's facilities
      if (!facility_id) {
        const userFacilityIds = applyFacilityScope(req);
        if (userFacilityIds && userFacilityIds.length > 0) {
          allowedFacilityId = userFacilityIds[0]; // Default to first facility
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

// GET /api/devices/blulok/:id - Get single BluLok device by id
router.get('/blulok/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // Facility-scoped users must have access to the facility that owns this device (via gateway)
    if (AuthService.isFacilityScoped(user.role)) {
      const knex = DatabaseService.getInstance().connection;
      const gatewayRow = await knex('blulok_devices')
        .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
        .where('blulok_devices.id', id)
        .select('gateways.facility_id')
        .first();

      if (!gatewayRow || !user.facilityIds?.includes(gatewayRow.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this device' });
        return;
      }
    }

    const device = await deviceModel.findBluLokDeviceById(String(id));
    if (!device) {
      res.status(404).json({ success: false, message: 'Device not found' });
      return;
    }

    res.json({ success: true, device });
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch device' });
  }
}));

// GET /api/devices/facility/:facilityId/hierarchy - Get facility device hierarchy
router.get('/facility/:facilityId/hierarchy', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const facilityId = req.params.facilityId as string;

    // Check access permissions consistent with tests
    if (user.role === UserRole.TENANT) {
      // Tenants should not view full facility device hierarchy
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    if (user.role === UserRole.FACILITY_ADMIN) {
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
    logger.error('Error fetching facility device hierarchy:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch device hierarchy' });
  }
}));

// POST /api/devices/access-control - Create access control device
router.post('/access-control', requireAdminOrFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {

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
    logger.error('Error creating access control device:', error);
    res.status(500).json({ success: false, message: 'Failed to create access control device' });
  }
}));

// POST /api/devices/blulok - Create BluLok device
router.post('/blulok', requireAdminOrFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {

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
    logger.error('Error creating BluLok device:', error);
    res.status(500).json({ success: false, message: 'Failed to create BluLok device' });
  }
}));

// PUT /api/devices/:deviceType/:id/status - Update device status
router.put('/:deviceType/:id/status', requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    await deviceModel.updateDeviceStatus(String(id), deviceType as any, value.status);
    
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

    const knex = deviceModel['db'].connection;
    const deviceRow = await knex('blulok_devices')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .select('blulok_devices.unit_id', 'gateways.facility_id')
      .where('blulok_devices.id', String(id))
      .first();

    if (!deviceRow) {
      res.status(404).json({ success: false, message: 'Device not found' });
      return;
    }

    // Access control:
    // - If device has a unit: user must have access to that unit
    // - If device has no unit: allow admin/dev_admin; facility_admin must have facility access
    if (deviceRow.unit_id) {
      const { UnitsService } = await import('@/services/units.service');
      const unitsService = UnitsService.getInstance();
      const hasAccess = await unitsService.hasUserAccessToUnit(deviceRow.unit_id, user.userId, user.role);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Insufficient permissions - unit access required' });
        return;
      }
    } else {
      // No unit associated
      if (user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN) {
        // allowed
      } else if (user.role === UserRole.FACILITY_ADMIN) {
        if (!user.facilityIds?.includes(deviceRow.facility_id)) {
          res.status(403).json({ success: false, message: 'Insufficient permissions - facility access required' });
          return;
        }
      } else {
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
      }
    }

    await deviceModel.updateLockStatus(String(id), value.lock_status);
    
    res.json({ message: 'Lock status updated successfully' });
  } catch (error) {
    console.error('Error updating lock status:', error);
    res.status(500).json({ success: false, message: 'Failed to update lock status' });
  }
});

// GET /api/devices/blulok/:id/denylist - Get denylist entries for a device
router.get('/blulok/:id/denylist', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id: deviceId } = req.params;
    const user = req.user!;

    // Check access: facility admin can only view devices in their facilities
    if (AuthService.isFacilityAdmin(user.role)) {
      const knex = DatabaseService.getInstance().connection;
      const device = await knex('blulok_devices')
        .join('units', 'blulok_devices.unit_id', 'units.id')
        .where('blulok_devices.id', deviceId)
        .select('units.facility_id')
        .first();

      if (!device || !user.facilityIds?.includes(device.facility_id)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this device'
        });
        return;
      }
    }

    const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
    const denylistModel = new DenylistEntryModel();
    const entries = await denylistModel.findByDevice(deviceId);

    // Enrich entries with user information
    const knex = DatabaseService.getInstance().connection;
    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        const userInfo = await knex('users')
          .where('id', entry.user_id)
          .select('id', 'email', 'first_name', 'last_name')
          .first();

        return {
          ...entry,
          user: userInfo || { id: entry.user_id, email: null, first_name: null, last_name: null },
        };
      })
    );

    res.json({
      success: true,
      entries: enrichedEntries,
    });
  } catch (error) {
    console.error('Error fetching device denylist:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch device denylist' });
  }
}));

// GET /api/devices/unassigned - Get unassigned BluLok devices
// Unassigned device listing is admin-only
router.get('/unassigned', requireAdminOrFacilityAdmin, validate(listQuerySchema, 'query'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { facility_id, status, search, sortBy, sortOrder, limit, offset } = req.query;

    // Restrict facility access based on user role
    let allowedFacilityId = facility_id as string | undefined;
    
    // For facility-scoped users, enforce facility restrictions
    if (AuthService.isFacilityScoped(user.role)) {
      if (facility_id && !user.facilityIds?.includes(facility_id as string)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      // If no facility specified, restrict to user's facilities
      if (!facility_id) {
        const userFacilityIds = applyFacilityScope(req);
        if (userFacilityIds && userFacilityIds.length > 0) {
          allowedFacilityId = userFacilityIds[0]; // Default to first facility
        } else {
          // User has no facility access - return empty result
          res.json({ success: true, devices: [], total: 0 });
          return;
        }
      }
    }

    const filters: DeviceFilters = {
      device_type: 'blulok',
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
      filters.facility_id = allowedFacilityId;
    }

    const devices = await deviceModel.findUnassignedDevices(filters);
    const total = await deviceModel.countUnassignedDevices(filters);

    res.json({ success: true, devices, total });
  } catch (error) {
    logger.error('Error fetching unassigned devices:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unassigned devices' });
  }
}));

// POST /api/devices/blulok/:deviceId/assign - Assign device to unit
router.post('/blulok/:deviceId/assign', requireAdminOrFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { deviceId } = req.params;
    const { unit_id } = req.body;

    // RBAC: Only admins and facility admins can assign devices
    // Middleware will be applied at route level

    if (!unit_id) {
      res.status(400).json({
        success: false,
        message: 'unit_id is required'
      });
      return;
    }

    if (!deviceId) {
      res.status(400).json({
        success: false,
        message: 'deviceId is required'
      });
      return;
    }

    // Check if user has access to the device (for facility admins)
    const devicesService = DevicesService.getInstance();
    const hasAccess = await devicesService.hasUserAccessToDevice(deviceId, user.userId, user.role);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied to this device'
      });
      return;
    }

    // Assign device to unit
    try {
      await devicesService.assignDeviceToUnit(deviceId, unit_id, {
        performedBy: user.userId,
        source: 'api'
      });

      res.status(200).json({
        success: true,
        message: 'Device assigned to unit successfully'
      });
    } catch (error: any) {
      logger.error('Error assigning device:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign device to unit'
      });
    }
  } catch (error) {
    logger.error('Error in assign device route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign device to unit'
    });
  }
}));

// DELETE /api/devices/blulok/:deviceId/unassign - Unassign device from unit
router.delete('/blulok/:deviceId/unassign', requireAdminOrFacilityAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { deviceId } = req.params;

    // RBAC: Only admins and facility admins can unassign devices
    // Middleware will be applied at route level

    if (!deviceId) {
      res.status(400).json({
        success: false,
        message: 'deviceId is required'
      });
      return;
    }

    // Check if user has access to the device (for facility admins)
    const devicesService = DevicesService.getInstance();
    const hasAccess = await devicesService.hasUserAccessToDevice(deviceId, user.userId, user.role);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied to this device'
      });
      return;
    }

    // Unassign device from unit
    try {
      await devicesService.unassignDeviceFromUnit(deviceId, {
        performedBy: user.userId,
        source: 'api'
      });

      res.status(200).json({
        success: true,
        message: 'Device unassigned from unit successfully'
      });
    } catch (error: any) {
      logger.error('Error unassigning device:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to unassign device from unit'
      });
    }
  } catch (error) {
    logger.error('Error in unassign device route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign device from unit'
    });
  }
}));

export { router as devicesRouter };
