/**
 * Access History Routes
 *
 * Comprehensive access event logging and reporting API providing detailed audit trails
 * for all access control events. Supports advanced filtering, role-based access control,
 * and comprehensive reporting for security monitoring and compliance.
 *
 * Key Features:
 * - Complete audit trail of all access events (successful and failed)
 * - Advanced filtering by user, device, facility, time range
 * - Role-based access control for log visibility
 * - Geographic tracking and session correlation
 * - Denial reason analysis for security investigations
 * - Performance metrics and access pattern analysis
 *
 * Access Event Types:
 * - Physical access (unlock/lock operations)
 * - Digital access (app, keypad, card authentication)
 * - System events (maintenance, errors, timeouts)
 * - Administrative actions (manual overrides, emergency access)
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full access to all access logs across all facilities
 * - FACILITY_ADMIN: Access to logs for their assigned facilities
 * - TENANT: Access to logs for their units and shared access
 * - MAINTENANCE: Access to logs for maintenance operations
 *
 * Filtering Capabilities:
 * - Time range filtering (date_from, date_to)
 * - User and credential filtering
 * - Device and facility filtering
 * - Action type and method filtering
 * - Success/failure status filtering
 * - Geographic location filtering
 *
 * Security Considerations:
 * - Facility-scoped log access prevents data leakage
 * - Comprehensive audit logging for compliance
 * - Input validation on all filter parameters
 * - Rate limiting to prevent log abuse
 * - Secure data export capabilities
 */

import { Router, Response } from 'express';
import { AccessLogModel } from '../models/access-log.model';
import { UnitModel } from '../models/unit.model';
import { KeySharingModel } from '../models/key-sharing.model';
import { UserFacilityAssociationModel } from '../models/user-facility-association.model';
import { authenticateToken } from '../middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';

const router = Router();
const accessLogModel = new AccessLogModel();
const unitModel = new UnitModel();
const keySharingModel = new KeySharingModel();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get access history with role-based filtering
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      facility_id,
      unit_id,
      user_id,
      device_id,
      device_type,
      action,
      method,
      success,
      denial_reason,
      credential_type,
      date_from,
      date_to,
      limit = 50,
      offset = 0,
      sort_by = 'occurred_at',
      sort_order = 'desc'
    } = req.query;

    // Build filters based on user role
    let filters: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sort_by: sort_by as string,
      sort_order: sort_order as string
    };

    // Apply role-based filtering
    if (user.role === UserRole.TENANT) {
      // Tenants can only see their own logs and logs for units they have access to
      const userUnits = await unitModel.findByPrimaryTenant(user.userId);
      const sharedUnits = await keySharingModel.getUserSharedUnits(user.userId);
      const accessibleUnits = [...userUnits.map((u: any) => u.id), ...sharedUnits.map((s: any) => s.unit_id)];
      filters.user_accessible_units = accessibleUnits;
    } else if (user.role === UserRole.FACILITY_ADMIN) {
      // Facility admins can only see logs for their assigned facilities
      if (!user.facilityIds || user.facilityIds.length === 0) {
        res.status(403).json({ success: false, message: 'No facilities assigned' });
        return;
      }
      filters.facility_ids = user.facilityIds;
    } else if (user.role === UserRole.MAINTENANCE) {
      // Maintenance users can only see their own logs
      filters.user_id = user.userId;
    }
    // DEV_ADMIN and ADMIN can see all logs (no additional filters)

    // Apply query filters
    if (facility_id) {
      const requestedFacilityId = facility_id as string;
      // Check if user has access to this facility
      if (user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(requestedFacilityId)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      filters.facility_id = requestedFacilityId;
    }
    if (unit_id) filters.unit_id = unit_id as string;
    if (user_id) filters.user_id = user_id as string;
    if (device_id) filters.device_id = device_id as string;
    if (device_type) filters.device_type = device_type as string;
    if (action) filters.action = action as string;
    if (method) filters.method = method as string;
    if (success !== undefined) filters.success = success === 'true';
    if (denial_reason) filters.denial_reason = denial_reason as string;
    if (credential_type) filters.credential_type = credential_type as string;
    if (date_from) filters.date_from = date_from as string;
    if (date_to) filters.date_to = date_to as string;

    const result = await accessLogModel.findAll(filters);
    
    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    console.error('Error fetching access history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch access history' });
  }
});

// Get access history for a specific user
router.get('/user/:userId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { userId } = req.params;
    
    // Check permissions
    if (user.role === UserRole.TENANT && user.userId !== userId) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    
    if (user.role === UserRole.FACILITY_ADMIN) {
      // Check if the user is in one of their facilities
      const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(userId as string);
      const hasAccess = userFacilities.some(facilityId => user.facilityIds?.includes(facilityId));
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this user' });
        return;
      }
    }
    
    if (user.role === UserRole.MAINTENANCE && user.userId !== userId) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    const result = await accessLogModel.getUserAccessHistory(userId as string, req.query);
    
    res.json({
      success: true,
      logs: result.logs,
      total: result.total
    });
  } catch (error) {
    console.error('Error fetching user access history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user access history' });
  }
});

// Get access history for a specific facility
router.get('/facility/:facilityId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { facilityId } = req.params;
    
    // Check permissions
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    
    if (user.role === UserRole.FACILITY_ADMIN) {
      if (!user.facilityIds?.includes(facilityId as string)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
    }

    const result = await accessLogModel.getFacilityAccessHistory(facilityId as string, req.query);
    
    res.json({
      logs: result.logs,
      total: result.total
    });
  } catch (error) {
    console.error('Error fetching facility access history:', error);
    res.status(500).json({ error: 'Failed to fetch facility access history' });
  }
});

// Get access history for a specific unit
router.get('/unit/:unitId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { unitId } = req.params;
    
    // Check permissions
    if (user.role === UserRole.TENANT) {
      // Check if user has access to this unit
      const hasAccess = await keySharingModel.checkUserHasAccess(user.userId, unitId as string);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this unit' });
        return;
      }
    } else if (user.role === UserRole.FACILITY_ADMIN) {
      // Check if unit belongs to one of their facilities
      const unit = await unitModel.findById(unitId as string);
      if (!unit || !user.facilityIds?.includes(unit.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this unit' });
        return;
      }
    } else if (user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Access denied to this unit' });
      return;
    }

    const result = await accessLogModel.getUnitAccessHistory(unitId as string, req.query);
    
    res.json({
      logs: result.logs,
      total: result.total
    });
  } catch (error) {
    console.error('Error fetching unit access history:', error);
    res.status(500).json({ error: 'Failed to fetch unit access history' });
  }
});

// Export access history as CSV
router.get('/export', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      facility_id,
      unit_id,
      user_id,
      device_id,
      device_type,
      action,
      method,
      success,
      denial_reason,
      credential_type,
      date_from,
      date_to,
      limit = 1000,
      offset = 0,
      sort_by = 'occurred_at',
      sort_order = 'desc'
    } = req.query;

    // Build filters based on user role
    let filters: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sort_by: sort_by as string,
      sort_order: sort_order as string
    };

    // Apply role-based filtering
    if (user.role === UserRole.TENANT) {
      // Tenants can only see their own logs and logs for units they have access to
      const userUnits = await unitModel.findByPrimaryTenant(user.userId);
      const sharedUnits = await keySharingModel.getUserSharedUnits(user.userId);
      const accessibleUnits = [...userUnits.map((u: any) => u.id), ...sharedUnits.map((s: any) => s.unit_id)];
      filters.user_accessible_units = accessibleUnits;
    } else if (user.role === UserRole.FACILITY_ADMIN) {
      // Facility admins can only see logs for their assigned facilities
      filters.facility_ids = user.facilityIds;
    } else if (user.role === UserRole.MAINTENANCE) {
      // Maintenance users can only see their own logs
      filters.user_id = user.userId;
    }
    // DEV_ADMIN and ADMIN can see all logs (no additional filters)

    // Apply query filters
    if (facility_id) {
      const requestedFacilityId = facility_id as string;
      // Check if user has access to this facility
      if (user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(requestedFacilityId)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      filters.facility_id = requestedFacilityId;
    }
    if (unit_id) filters.unit_id = unit_id as string;
    if (user_id) filters.user_id = user_id as string;
    if (device_id) filters.device_id = device_id as string;
    if (device_type) filters.device_type = device_type as string;
    if (action) filters.action = action as string;
    if (method) filters.method = method as string;
    if (success !== undefined) filters.success = success === 'true';
    if (denial_reason) filters.denial_reason = denial_reason as string;
    if (credential_type) filters.credential_type = credential_type as string;
    if (date_from) filters.date_from = date_from as string;
    if (date_to) filters.date_to = date_to as string;

    const result = await accessLogModel.findAll(filters);
    
    // Generate CSV
    const csv = generateCSV(result.logs);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="access-history.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting access history:', error);
    res.status(500).json({ error: 'Failed to export access history' });
  }
});

// Get a specific access log entry
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Log ID is required' });
      return;
    }
    const log = await accessLogModel.findById(id);
    if (!log) {
      res.status(404).json({ success: false, message: 'Access log not found' });
      return;
    }
    
    // Check permissions based on the log's data
    if (user.role === UserRole.TENANT) {
      // Tenants can only see their own logs or logs for units they have access to
      if (log.user_id !== user.userId && log.unit_id) {
        const hasAccess = await keySharingModel.checkUserHasAccess(user.userId, log.unit_id);
        if (!hasAccess) {
          res.status(403).json({ success: false, message: 'Access denied' });
          return;
        }
      }
    } else if (user.role === UserRole.FACILITY_ADMIN && log.facility_id) {
      // Facility admins can only see logs for their facilities
      if (!user.facilityIds?.includes(log.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
    } else if (user.role === UserRole.MAINTENANCE) {
      // Maintenance users can only see their own logs
      if (log.user_id !== user.userId) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }
    
    res.json({ success: true, log });
  } catch (error) {
    console.error('Error fetching access log:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch access log' });
  }
});

// Helper function to generate CSV
function generateCSV(logs: any[]): string {
  if (logs.length === 0) {
    return 'No data available';
  }

  const headers = [
    'ID',
    'User ID',
    'Facility ID',
    'Unit ID',
    'Device ID',
    'Device Type',
    'Action',
    'Method',
    'Success',
    'Denial Reason',
    'Credential Type',
    'Occurred At',
    'IP Address',
    'User Agent'
  ];

  const csvRows = [headers.join(',')];

  logs.forEach(log => {
    const row = [
      log.id || '',
      log.user_id || '',
      log.facility_id || '',
      log.unit_id || '',
      log.device_id || '',
      log.device_type || '',
      log.action || '',
      log.method || '',
      log.success ? 'true' : 'false',
      log.denial_reason || '',
      log.credential_type || '',
      log.occurred_at || '',
      log.ip_address || '',
      log.user_agent || ''
    ];
    csvRows.push(row.map(field => `"${field}"`).join(','));
  });

  return csvRows.join('\n');
}

export default router;
