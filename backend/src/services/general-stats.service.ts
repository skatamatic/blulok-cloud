import { DatabaseService } from './database.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { AuthService } from '@/services/auth.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { AccessDeniedError } from '@/middleware/error.middleware';

/**
 * General Statistics Data Interface
 */
export interface GeneralStatsData {
  facilities: {
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    error: number;
    maintenance: number;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  /** Unread high/urgent notifications relevant to the user's scope (dashboard “alerts”) */
  alerts: {
    open: number;
  };
  lastUpdated: string;
}

export interface ScopedGeneralStatsData extends GeneralStatsData {
  scope: {
    type: 'all' | 'facility_limited';
    facilityIds?: string[];
  };
}

function firstRowFromMysqlRaw(result: unknown): Record<string, any> {
  if (result == null) return {};
  const r = result as any[];
  const rows = r[0];
  if (Array.isArray(rows) && rows[0] !== undefined && typeof rows[0] === 'object') {
    return rows[0] as Record<string, any>;
  }
  return {};
}

function rowsFromMysqlRaw(result: unknown): any[] {
  if (result == null) return [];
  const r = result as any[];
  const rows = r[0];
  return Array.isArray(rows) ? rows : [];
}

export class GeneralStatsService {
  private static instance: GeneralStatsService;
  private db = DatabaseService.getInstance();

  public static getInstance(): GeneralStatsService {
    if (!GeneralStatsService.instance) {
      GeneralStatsService.instance = new GeneralStatsService();
    }
    return GeneralStatsService.instance;
  }

  /**
   * @param facilityId When set (e.g. global facility selector), stats are limited to that facility.
   *                    Caller must enforce access; use {@link AuthService.canAccessFacility} first or rely on route.
   */
  public async getScopedStats(
    userId: string,
    userRole: UserRole,
    options?: { facilityId?: string }
  ): Promise<ScopedGeneralStatsData> {
    try {
      let scope = await this.determineScope(userId, userRole);

      if (options?.facilityId) {
        const ok = await AuthService.canAccessFacility(userId, userRole, options.facilityId);
        if (!ok) {
          throw new AccessDeniedError('Not allowed to view statistics for this facility');
        }
        scope = { type: 'facility_limited', facilityIds: [options.facilityId] };
      }

      const stats = await this.calculateStats(scope, userId);
      return {
        ...stats,
        scope,
      };
    } catch (error) {
      logger.error('Error getting scoped stats:', error);
      throw error;
    }
  }

  private async determineScope(userId: string, userRole: UserRole): Promise<{ type: 'all' | 'facility_limited'; facilityIds?: string[] }> {
    if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
      return { type: 'all' };
    }

    if (userRole === UserRole.FACILITY_ADMIN || userRole === UserRole.MAINTENANCE) {
      const facilityIds = await FacilityAccessService.getUserFacilityIds(userId, userRole);
      return { type: 'facility_limited', facilityIds };
    }

    throw new Error('Access denied: General stats subscription requires ADMIN, DEV_ADMIN, FACILITY_ADMIN, or MAINTENANCE role');
  }

  private emptyStats(): Omit<GeneralStatsData, 'lastUpdated'> {
    const byRole: Record<UserRole, number> = {
      [UserRole.TENANT]: 0,
      [UserRole.FACILITY_ADMIN]: 0,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 0,
      [UserRole.ADMIN]: 0,
      [UserRole.DEV_ADMIN]: 0,
    };
    return {
      facilities: { total: 0, active: 0, inactive: 0, maintenance: 0 },
      devices: { total: 0, online: 0, offline: 0, error: 0, maintenance: 0 },
      users: { total: 0, active: 0, inactive: 0, byRole },
      alerts: { open: 0 },
    };
  }

  /**
   * Unread notifications with priority high/urgent, optionally scoped to facilities the user cares about.
   */
  private async countAlertNotifications(
    userId: string,
    scope: { type: 'all' | 'facility_limited'; facilityIds?: string[] }
  ): Promise<number> {
    const knex = this.db.connection;
    try {
      const q = knex('notifications')
        .where({ user_id: userId, is_read: false, is_deleted: false })
        .whereIn('priority', ['high', 'urgent']);

      if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
        q.andWhere(function () {
          this.whereNull('facility_id').orWhereIn('facility_id', scope.facilityIds!);
        });
      }

      const rows = await q.count('* as c');
      const raw = (rows[0] as { c?: string | number })?.c;
      return parseInt(String(raw ?? 0), 10) || 0;
    } catch (e) {
      logger.warn('countAlertNotifications failed:', e);
      return 0;
    }
  }

  private async calculateStats(
    scope: { type: 'all' | 'facility_limited'; facilityIds?: string[] },
    userId: string
  ): Promise<GeneralStatsData> {
    const knex = this.db.connection;
    const ids = scope.type === 'facility_limited' ? scope.facilityIds?.filter(Boolean) ?? [] : [];

    if (scope.type === 'facility_limited' && ids.length === 0) {
      const open = await this.countAlertNotifications(userId, scope);
      return {
        ...this.emptyStats(),
        alerts: { open },
        lastUpdated: new Date().toISOString(),
      };
    }

    const inList = ids.length ? ids.map(() => '?').join(',') : '';
    const facilityFilter = ids.length ? `AND f.id IN (${inList})` : '';
    const facilityParams = ids;

    const deviceParams = ids.length ? [...ids, ...ids] : [];

    const facilityStats = await knex.raw(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN f.status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN f.status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN f.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
      FROM facilities f
      WHERE 1=1 ${facilityFilter}
    `,
      facilityParams
    );

    const deviceStats = await knex.raw(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN devices.status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN devices.status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN devices.status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN devices.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
      FROM (
        SELECT acd.status FROM access_control_devices acd
        JOIN gateways g ON acd.gateway_id = g.id
        JOIN facilities f ON g.facility_id = f.id
        WHERE 1=1 ${facilityFilter}
        UNION ALL
        SELECT bd.device_status as status FROM blulok_devices bd
        JOIN units u ON bd.unit_id = u.id
        JOIN facilities f ON u.facility_id = f.id
        WHERE 1=1 ${facilityFilter}
      ) devices
    `,
      deviceParams
    );

    const userJoin = ids.length
      ? `JOIN user_facility_associations ufa ON u.id = ufa.user_id 
           WHERE ufa.facility_id IN (${ids.map(() => '?').join(',')})`
      : 'WHERE 1=1';

    const userStats = await knex.raw(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) as inactive
      FROM users u
      ${userJoin}
    `,
      ids.length ? ids : []
    );

    const roleStats = await knex.raw(
      `
      SELECT 
        u.role,
        COUNT(*) as count
      FROM users u
      ${userJoin}
      GROUP BY u.role
    `,
      ids.length ? ids : []
    );

    const byRole: Record<UserRole, number> = {
      [UserRole.TENANT]: 0,
      [UserRole.FACILITY_ADMIN]: 0,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 0,
      [UserRole.ADMIN]: 0,
      [UserRole.DEV_ADMIN]: 0,
    };

    for (const row of rowsFromMysqlRaw(roleStats)) {
      if (row && row.role in byRole) {
        byRole[row.role as UserRole] = parseInt(String(row.count), 10) || 0;
      }
    }

    const facilityData = firstRowFromMysqlRaw(facilityStats);
    const deviceData = firstRowFromMysqlRaw(deviceStats);
    const userData = firstRowFromMysqlRaw(userStats);

    const openAlerts = await this.countAlertNotifications(userId, scope);

    return {
      facilities: {
        total: parseInt(facilityData.total, 10) || 0,
        active: parseInt(facilityData.active, 10) || 0,
        inactive: parseInt(facilityData.inactive, 10) || 0,
        maintenance: parseInt(facilityData.maintenance, 10) || 0,
      },
      devices: {
        total: parseInt(deviceData.total, 10) || 0,
        online: parseInt(deviceData.online, 10) || 0,
        offline: parseInt(deviceData.offline, 10) || 0,
        error: parseInt(deviceData.error, 10) || 0,
        maintenance: parseInt(deviceData.maintenance, 10) || 0,
      },
      users: {
        total: parseInt(userData.total, 10) || 0,
        active: parseInt(userData.active, 10) || 0,
        inactive: parseInt(userData.inactive, 10) || 0,
        byRole,
      },
      alerts: { open: openAlerts },
      lastUpdated: new Date().toISOString(),
    };
  }

  public canSubscribeToGeneralStats(userRole: UserRole): boolean {
    return (
      userRole === UserRole.ADMIN ||
      userRole === UserRole.DEV_ADMIN ||
      userRole === UserRole.FACILITY_ADMIN ||
      userRole === UserRole.MAINTENANCE
    );
  }
}
