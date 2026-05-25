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
import { authenticateToken } from '../middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '../types/auth.types';
import { AccessHistoryReadService, AccessHistoryRecord, QueryFilters } from '@/services/access/access-history-read.service';
import { AccessLogModel } from '@/models/access-log.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitModel } from '@/models/unit.model';
import { MAX_HISTOGRAM_FACILITIES } from '@/constants/access-history.constants';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';

const router = Router();
let accessHistoryReadService: AccessHistoryReadService | null = null;
let legacyAccessLogModel: AccessLogModel | null = null;
let keySharingModel: KeySharingModel | null = null;
let unitModel: UnitModel | null = null;
let activityLogModel: ActivityLogModel | null = null;
let scopeService: AccessEventScopeService | null = null;

const getAccessHistoryReadService = (): AccessHistoryReadService => {
  if (!accessHistoryReadService) {
    accessHistoryReadService = new AccessHistoryReadService();
  }
  return accessHistoryReadService;
};

const getLegacyAccessLogModel = (): AccessLogModel => {
  if (!legacyAccessLogModel) {
    legacyAccessLogModel = new AccessLogModel();
  }
  return legacyAccessLogModel;
};

const getKeySharingModel = (): KeySharingModel => {
  if (!keySharingModel) {
    keySharingModel = new KeySharingModel();
  }
  return keySharingModel;
};

const getUnitModel = (): UnitModel => {
  if (!unitModel) {
    unitModel = new UnitModel();
  }
  return unitModel;
};

const getActivityLogModel = (): ActivityLogModel => {
  if (!activityLogModel) {
    activityLogModel = new ActivityLogModel();
  }
  return activityLogModel;
};

const getScopeService = (): AccessEventScopeService => {
  if (!scopeService) {
    scopeService = new AccessEventScopeService();
  }
  return scopeService;
};

router.use(authenticateToken);

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return undefined;
};

const normalizeFilters = (query: AuthenticatedRequest['query']): QueryFilters => ({
  facility_id: typeof query.facility_id === 'string' ? query.facility_id : undefined,
  unit_id: typeof query.unit_id === 'string' ? query.unit_id : undefined,
  user_id: typeof query.user_id === 'string' ? query.user_id : undefined,
  device_id: typeof query.device_id === 'string' ? query.device_id : undefined,
  action: typeof query.action === 'string' ? query.action : undefined,
  method: typeof query.method === 'string' ? query.method : undefined,
  denial_reason: typeof query.denial_reason === 'string' ? query.denial_reason : undefined,
  date_from:
    typeof query.date_from === 'string'
      ? query.date_from
      : typeof query.start_date === 'string'
        ? query.start_date
        : undefined,
  date_to:
    typeof query.date_to === 'string'
      ? query.date_to
      : typeof query.end_date === 'string'
        ? query.end_date
        : undefined,
  success: parseBoolean(query.success),
  limit: Number(query.limit) || 50,
  offset: Number(query.offset) || 0,
  sort_by: typeof query.sort_by === 'string' ? query.sort_by : 'occurred_at',
  sort_order: query.sort_order === 'asc' ? 'asc' : 'desc',
});

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (typeof req.query.facility_id === 'string' && user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(req.query.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
    const result = await getAccessHistoryReadService().query(user.userId, user.role, user.facilityIds, normalizeFilters(req.query));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch access history' });
  }
});

router.get('/user/:userId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const targetUserId = req.params.userId;

    if ((user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) && user.userId !== targetUserId) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    if (user.role === UserRole.FACILITY_ADMIN) {
      const targetFacilities = await UserFacilityAssociationModel.getUserFacilityIds(targetUserId);
      const hasSharedFacility = targetFacilities.some((id) => user.facilityIds?.includes(id));
      if (!hasSharedFacility) {
        res.status(403).json({ success: false, message: 'Access denied to this user' });
        return;
      }
    }

    const result = await getAccessHistoryReadService().query(user.userId, user.role, user.facilityIds, {
      ...normalizeFilters(req.query),
      user_id: targetUserId,
    });

    res.json({ success: true, logs: result.logs, total: result.total, limit: result.limit, offset: result.offset });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch user access history' });
  }
});

router.get('/facility/:facilityId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    if (user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(req.params.facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
    const result = await getAccessHistoryReadService().query(user.userId, user.role, user.facilityIds, {
      ...normalizeFilters(req.query),
      facility_id: req.params.facilityId,
    });
    res.json({ success: true, logs: result.logs, total: result.total, limit: result.limit, offset: result.offset });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch facility access history' });
  }
});

router.get('/unit/:unitId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role === UserRole.TENANT) {
      const hasAccess = await getKeySharingModel().checkUserHasAccess(user.userId, req.params.unitId);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this unit' });
        return;
      }
    }
    if (user.role === UserRole.FACILITY_ADMIN) {
      const unit = await getUnitModel().findById(req.params.unitId);
      if (!unit || !user.facilityIds?.includes(unit.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this unit' });
        return;
      }
    }
    if (user.role === UserRole.MAINTENANCE) {
      res.status(403).json({ success: false, message: 'Access denied to this unit' });
      return;
    }
    const result = await getAccessHistoryReadService().query(user.userId, user.role, user.facilityIds, {
      ...normalizeFilters(req.query),
      unit_id: req.params.unitId,
    });
    res.json({ success: true, logs: result.logs, total: result.total, limit: result.limit, offset: result.offset });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch unit access history' });
  }
});

router.get('/export', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (typeof req.query.facility_id === 'string' && user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(req.query.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
    const data = await getAccessHistoryReadService().exportQuery(user.userId, user.role, user.facilityIds, {
      ...normalizeFilters(req.query),
      limit: Math.min(Number(req.query.limit) || 1000, 5000),
    });

    const csv = generateCSV(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="access-history.csv"');
    res.send(csv);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to export access history' });
  }
});

router.get('/stats/activity', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.json({ success: true, data: [], period: req.query.period || 'month' });
      return;
    }

    const period = typeof req.query.period === 'string' ? req.query.period : 'month';
    if (period !== 'day' && period !== 'week' && period !== 'month' && period !== 'year') {
      res.status(400).json({ success: false, message: 'Invalid period. Must be one of: day, week, month, year' });
      return;
    }
    const now = new Date();
    let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let groupBy: 'hour' | 'day' | 'week' = 'day';

    if (period === 'day') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      groupBy = 'hour';
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = 'day';
    } else if (period === 'year') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      groupBy = 'week';
    }

    const requestedFacilityIds = Array.isArray(req.query.facility_ids)
      ? (req.query.facility_ids as string[])
      : typeof req.query.facility_ids === 'string'
        ? [req.query.facility_ids]
        : [];

    const allowedFacilityIds = user.role === UserRole.FACILITY_ADMIN
      ? requestedFacilityIds.length > 0
        ? requestedFacilityIds.filter((id) => user.facilityIds?.includes(id))
        : user.facilityIds
      : requestedFacilityIds.length > 0
        ? requestedFacilityIds
        : user.facilityIds;

    const cappedFacilityIds =
      allowedFacilityIds && allowedFacilityIds.length > MAX_HISTOGRAM_FACILITIES
        ? allowedFacilityIds.slice(0, MAX_HISTOGRAM_FACILITIES)
        : allowedFacilityIds && allowedFacilityIds.length > 0
          ? allowedFacilityIds
          : undefined;

    const result = await getActivityLogModel().getActivityStats({
      startDate,
      endDate: now,
      facilityIds: cappedFacilityIds && cappedFacilityIds.length > 0 ? cappedFacilityIds : undefined,
      groupBy,
    });

    res.json({
      success: true,
      data: result,
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch activity stats' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const raw = await getActivityLogModel().findById(req.params.id);
    if (raw && AccessHistoryReadService.DASHBOARD_ACTIVITY_TYPES.includes(raw.activity_type)) {
      const scope = await getScopeService().buildScope(user.userId, user.role, user.facilityIds);
      if (scope.allowedFacilityIds && raw.facility_id && !scope.allowedFacilityIds.includes(raw.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      if (scope.allowedUnitIds) {
        const canViewUnit = !!raw.unit_id && scope.allowedUnitIds.includes(raw.unit_id);
        const canViewOwn = raw.actor_id === user.userId;
        if (!canViewUnit && !canViewOwn) {
          res.status(403).json({ success: false, message: 'Access denied' });
          return;
        }
      }
      if (scope.ownUserId && !scope.allowedUnitIds && raw.actor_id !== scope.ownUserId) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    } else {
      const legacy = await getLegacyAccessLogModel().findById(req.params.id);
      if (!legacy) {
        res.status(404).json({ success: false, message: 'Access log not found' });
        return;
      }
      if (user.role === UserRole.FACILITY_ADMIN && legacy.facility_id && !user.facilityIds?.includes(legacy.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this facility' });
        return;
      }
      if (user.role === UserRole.TENANT && legacy.user_id !== user.userId && legacy.unit_id) {
        const hasUnitAccess = await getKeySharingModel().checkUserHasAccess(user.userId, legacy.unit_id);
        if (!hasUnitAccess) {
          res.status(403).json({ success: false, message: 'Access denied' });
          return;
        }
      }
      if (user.role === UserRole.MAINTENANCE && legacy.user_id !== user.userId) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }

    const log = await getAccessHistoryReadService().findById(req.params.id, user.userId, user.role, user.facilityIds);
    if (!log) {
      res.status(404).json({ success: false, message: 'Access log not found' });
      return;
    }
    res.json({ success: true, log });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch access log' });
  }
});

function generateCSV(logs: AccessHistoryRecord[]): string {
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
    'Occurred At',
  ];
  const rows = logs.map((log) => [
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
    log.occurred_at || '',
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((field) => `"${field}"`).join(','))].join('\n');
}

export default router;
