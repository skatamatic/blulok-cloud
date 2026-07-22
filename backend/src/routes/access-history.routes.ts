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
import { registerGet } from '@/openapi/register-route';
import {
  accessHistoryQuerySchema,
  accessHistoryUserIdParamSchema,
  accessHistoryFacilityIdParamSchema,
  accessHistoryUnitIdParamSchema,
  accessHistoryIdParamSchema,
  accessHistoryExportQuerySchema,
  accessHistoryStatsQuerySchema,
  accessHistoryResponseSchema,
} from '@/schemas/access-history.schemas';
import { AccessHistoryReadService, AccessHistoryRecord, QueryFilters } from '@/services/access/access-history-read.service';
import { AccessLogModel } from '@/models/access-log.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitModel } from '@/models/unit.model';
import { MAX_HISTOGRAM_FACILITIES } from '@/constants/access-history.constants';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import {
  parseQueryBoolean,
  queryString,
  queryDateString,
  queryStringArray,
} from '@/utils/query-boolean.util';
import { resolveBluLokDeviceDisplayName } from '@/utils/blulok-device-display.utils';

const router = Router();
const MOUNT = '/api/v1/access-history';
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

const normalizeFilters = (query: AuthenticatedRequest['query']): QueryFilters => ({
  facility_id: queryString(query.facility_id),
  unit_id: queryString(query.unit_id),
  user_id: queryString(query.user_id),
  device_id: queryString(query.device_id),
  action: queryString(query.action) ?? queryString(query.action_type),
  method: queryString(query.method),
  denial_reason: queryString(query.denial_reason),
  date_from: queryDateString(query.date_from) ?? queryDateString(query.start_date),
  date_to: queryDateString(query.date_to) ?? queryDateString(query.end_date),
  success: parseQueryBoolean(query.success),
  limit: Number(query.limit) || 50,
  offset: Number(query.offset) || 0,
  sort_by: queryString(query.sort_by) ?? 'occurred_at',
  sort_order: query.sort_order === 'asc' ? 'asc' : 'desc',
});

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['AccessHistory'],
    summary: 'Query access history with filters',
    security: 'bearer',
    query: accessHistoryQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const facilityId = queryString(req.query.facility_id);
    if (facilityId && user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }
    const result = await getAccessHistoryReadService().query(user.userId, user.role, user.facilityIds, normalizeFilters(req.query));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch access history' });
  }
});

registerGet(
  router,
  '/user/:userId',
  {
    openApiPath: `${MOUNT}/user/{userId}`,
    tags: ['AccessHistory'],
    summary: 'Get access history for a user',
    security: 'bearer',
    params: accessHistoryUserIdParamSchema,
    query: accessHistoryQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

registerGet(
  router,
  '/facility/:facilityId',
  {
    openApiPath: `${MOUNT}/facility/{facilityId}`,
    tags: ['AccessHistory'],
    summary: 'Get access history for a facility',
    security: 'bearer',
    params: accessHistoryFacilityIdParamSchema,
    query: accessHistoryQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

registerGet(
  router,
  '/unit/:unitId',
  {
    openApiPath: `${MOUNT}/unit/{unitId}`,
    tags: ['AccessHistory'],
    summary: 'Get access history for a unit',
    security: 'bearer',
    params: accessHistoryUnitIdParamSchema,
    query: accessHistoryQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

registerGet(
  router,
  '/export',
  {
    openApiPath: `${MOUNT}/export`,
    tags: ['AccessHistory'],
    summary: 'Export access history as CSV',
    security: 'bearer',
    query: accessHistoryExportQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const facilityId = queryString(req.query.facility_id);
    if (facilityId && user.role === UserRole.FACILITY_ADMIN && !user.facilityIds?.includes(facilityId)) {
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

registerGet(
  router,
  '/stats/activity',
  {
    openApiPath: `${MOUNT}/stats/activity`,
    tags: ['AccessHistory'],
    summary: 'Get access activity statistics',
    security: 'bearer',
    query: accessHistoryStatsQuerySchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
      res.json({ success: true, data: [], period: req.query.period || 'month' });
      return;
    }

    const period = queryString(req.query.period) ?? 'month';
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

    const requestedFacilityIds = queryStringArray(req.query.facility_ids);

    let allowedFacilityIds: string[] | undefined;

    if (user.role === UserRole.FACILITY_ADMIN) {
      allowedFacilityIds = requestedFacilityIds.length > 0
        ? requestedFacilityIds.filter((id) => user.facilityIds?.includes(id))
        : user.facilityIds;
    } else if (AuthService.canAccessAllFacilities(user.role)) {
      allowedFacilityIds = requestedFacilityIds.length > 0 ? requestedFacilityIds : undefined;
    } else {
      allowedFacilityIds = requestedFacilityIds.length > 0
        ? requestedFacilityIds
        : user.facilityIds;
    }

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

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['AccessHistory'],
    summary: 'Get access history entry by ID',
    security: 'bearer',
    params: accessHistoryIdParamSchema,
    responses: {
      200: accessHistoryResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const raw = await getActivityLogModel().findById(req.params.id);
    if (raw && AccessHistoryReadService.ACCESS_HISTORY_ACTIVITY_TYPES.includes(raw.activity_type)) {
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
    'User',
    'Facility',
    'Unit',
    'Device',
    'Device Type',
    'Action',
    'Method',
    'Status',
    'Failure Reason',
    'Occurred At',
  ];
  const rows = logs.map((log) => [
    log.user_name || '',
    log.facility_name || '',
    log.unit_number ? `Unit ${log.unit_number}` : '',
    log.device_name
      || (log.device_type === 'blulok'
        ? resolveBluLokDeviceDisplayName({
          device_serial: log.device_serial,
          unit_number: log.unit_number,
        })
        : (log.device_serial || '')),
    log.device_type || '',
    log.action || '',
    log.method || '',
    log.success ? 'Success' : 'Failed',
    log.metadata && typeof log.metadata === 'object' && log.metadata !== null && 'failure_summary' in log.metadata
      ? String((log.metadata as Record<string, unknown>).failure_summary ?? '')
      : log.denial_reason || log.reason || '',
    log.occurred_at || '',
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export default router;
