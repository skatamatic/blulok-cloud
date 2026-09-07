/**
 * Access Sessions API — session-aggregated Access History for web UI and new app clients.
 * Legacy per-event rows remain on GET /api/v1/access-history (raw by default).
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { AuthenticatedRequest, UserRole } from '../types/auth.types';
import { registerGet } from '@/openapi/register-route';
import {
  accessSessionsQuerySchema,
  accessSessionsIdParamSchema,
  accessSessionsExportQuerySchema,
  accessSessionsResponseSchema,
} from '@/schemas/access-sessions.schemas';
import {
  AccessSessionReadService,
  AccessSessionRecord,
  SessionQueryFilters,
} from '@/services/access/access-session-read.service';
import {
  parseQueryBoolean,
  queryString,
  queryDateString,
} from '@/utils/query-boolean.util';
import type { AccessSessionState } from '@/models/access-session.model';

const router = Router();
const MOUNT = '/api/v1/access-sessions';
let accessSessionReadService: AccessSessionReadService | null = null;

const getAccessSessionReadService = (): AccessSessionReadService => {
  if (!accessSessionReadService) {
    accessSessionReadService = new AccessSessionReadService();
  }
  return accessSessionReadService;
};

router.use(authenticateToken);

const normalizeFilters = (query: AuthenticatedRequest['query']): SessionQueryFilters => {
  const stateRaw = queryString(query.state);
  const validStates = new Set([
    'pending', 'open', 'closed', 'timed_out', 'denied', 'failed',
  ]);
  return {
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
    state: stateRaw && validStates.has(stateRaw) ? (stateRaw as AccessSessionState) : undefined,
    view: 'sessions',
  };
};

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['AccessSessions'],
    summary: 'Query access sessions (one logical access per row)',
    security: 'bearer',
    query: accessSessionsQuerySchema,
    responses: {
      200: accessSessionsResponseSchema,
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
      const filters = normalizeFilters(req.query);
      const result = await getAccessSessionReadService().query(
        user.userId, user.role, user.facilityIds, filters,
      );
      res.json({
        success: true,
        sessions: result.sessions,
        total: result.total,
        currently_open: result.currently_open,
        limit: result.limit,
        offset: result.offset,
      });
    } catch {
      res.status(500).json({ success: false, message: 'Failed to fetch access sessions' });
    }
  },
);

registerGet(
  router,
  '/export',
  {
    openApiPath: `${MOUNT}/export`,
    tags: ['AccessSessions'],
    summary: 'Export access sessions as CSV',
    security: 'bearer',
    query: accessSessionsExportQuerySchema,
    responses: {
      200: accessSessionsResponseSchema,
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
      const filters = {
        ...normalizeFilters(req.query),
        limit: Math.min(Number(req.query.limit) || 1000, 5000),
      };
      const data = await getAccessSessionReadService().exportQuery(
        user.userId, user.role, user.facilityIds, filters,
      );
      const csv = generateSessionCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="access-sessions.csv"');
      res.send(csv);
    } catch {
      res.status(500).json({ success: false, message: 'Failed to export access sessions' });
    }
  },
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['AccessSessions'],
    summary: 'Get access session by ID with linked event timeline',
    security: 'bearer',
    params: accessSessionsIdParamSchema,
    responses: {
      200: accessSessionsResponseSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const sessionDetail = await getAccessSessionReadService().findById(
        req.params.id, user.userId, user.role, user.facilityIds,
      );
      if (!sessionDetail) {
        res.status(404).json({ success: false, message: 'Access session not found' });
        return;
      }
      res.json({
        success: true,
        session: sessionDetail.session,
        events: sessionDetail.events,
      });
    } catch {
      res.status(500).json({ success: false, message: 'Failed to fetch access session' });
    }
  },
);

function generateSessionCSV(sessions: AccessSessionRecord[]): string {
  if (sessions.length === 0) {
    return 'No data available';
  }
  const headers = [
    'User',
    'Facility',
    'Unit',
    'Device',
    'Device Type',
    'Method',
    'Origin',
    'State',
    'Outcome',
    'Attempts',
    'Open Duration (sec)',
    'Denial Reason',
    'Started At',
    'Opened At',
    'Closed At',
  ];
  const rows = sessions.map((s) => [
    s.user_name || '',
    s.facility_name || '',
    s.unit_number ? `Unit ${s.unit_number}` : '',
    s.device_name || s.device_serial || '',
    s.device_type || '',
    s.method || '',
    s.origin || '',
    s.state || '',
    s.outcome || '',
    String(s.attempt_count ?? 1),
    s.open_duration_sec != null ? String(s.open_duration_sec) : '',
    s.denial_reason || s.reason || '',
    s.started_at || '',
    s.opened_at || '',
    s.closed_at || '',
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export default router;
