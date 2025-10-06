import { DatabaseService } from './database.service';
import { UserRole } from '@/types/auth.types';
// Dynamic import to avoid circular dependency
import { logger } from '@/utils/logger';

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
  lastUpdated: string;
}

export interface ScopedGeneralStatsData extends GeneralStatsData {
  scope: {
    type: 'all' | 'facility_limited';
    facilityIds?: string[];
  };
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
   * Get general statistics scoped by user role and facility access
   */
  public async getScopedStats(userId: string, userRole: UserRole): Promise<ScopedGeneralStatsData> {
    try {
      // Determine scope based on role
      const scope = await this.determineScope(userId, userRole);
      
      // Get scoped statistics
      const stats = await this.calculateStats(scope);
      
      return {
        ...stats,
        scope
      };
    } catch (error) {
      logger.error('Error getting scoped stats:', error);
      throw error;
    }
  }

  /**
   * Determine the scope of data access based on user role
   */
  private async determineScope(userId: string, userRole: UserRole): Promise<{ type: 'all' | 'facility_limited'; facilityIds?: string[] }> {
    // Admin and Dev Admin see all data
    if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
      return { type: 'all' };
    }

    // Facility Admin sees only their associated facilities
    if (userRole === UserRole.FACILITY_ADMIN) {
      const { UserFacilityAssociationModel } = await import('@/models/user-facility-association.model') as any;
      const facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
      return { type: 'facility_limited', facilityIds };
    }

    // Other roles cannot access general stats
    throw new Error('Access denied: General stats subscription requires ADMIN, DEV_ADMIN, or FACILITY_ADMIN role');
  }

  /**
   * Calculate statistics based on scope
   */
  private async calculateStats(scope: { type: 'all' | 'facility_limited'; facilityIds?: string[] }): Promise<GeneralStatsData> {
    const knex = this.db.connection;

    // Build facility filter
    let facilityFilter = '';
    let facilityParams: string[] = [];
    if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
      facilityFilter = 'AND f.id IN (?)';
      facilityParams = [scope.facilityIds.join(',')];
    }

    // Get facility statistics
    const facilityStats = await knex.raw(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
      FROM facilities f
      WHERE 1=1 ${facilityFilter}
    `, facilityParams);

    // Get device statistics (both access control and blulok devices)
    const deviceStats = await knex.raw(`
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
    `, facilityParams);

    // Get user statistics
    const userStats = await knex.raw(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
      FROM users u
      ${scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0 
        ? `JOIN user_facility_associations ufa ON u.id = ufa.user_id 
           WHERE ufa.facility_id IN (?)` 
        : 'WHERE 1=1'
      }
    `, scope.type === 'facility_limited' && scope.facilityIds ? [scope.facilityIds] : []);

    // Get user role statistics
    const roleStats = await knex.raw(`
      SELECT 
        role,
        COUNT(*) as count
      FROM users u
      ${scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0 
        ? `JOIN user_facility_associations ufa ON u.id = ufa.user_id 
           WHERE ufa.facility_id IN (?)` 
        : 'WHERE 1=1'
      }
      GROUP BY role
    `, scope.type === 'facility_limited' && scope.facilityIds ? [scope.facilityIds] : []);

    // Process role statistics
    const byRole: Record<UserRole, number> = {
      [UserRole.TENANT]: 0,
      [UserRole.FACILITY_ADMIN]: 0,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 0,
      [UserRole.ADMIN]: 0,
      [UserRole.DEV_ADMIN]: 0,
    };

    if (Array.isArray(roleStats)) {
      roleStats.forEach((row: any) => {
        if (row.role in byRole) {
          byRole[row.role as UserRole] = parseInt(row.count) || 0;
        }
      });
    }

    // Extract data from the wrapped format
    const facilityData = facilityStats[0]?.[0] || facilityStats[0] || {};
    const deviceData = deviceStats[0]?.[0] || deviceStats[0] || {};
    const userData = userStats[0]?.[0] || userStats[0] || {};

    return {
      facilities: {
        total: parseInt(facilityData.total) || 0,
        active: parseInt(facilityData.active) || 0,
        inactive: parseInt(facilityData.inactive) || 0,
        maintenance: parseInt(facilityData.maintenance) || 0,
      },
      devices: {
        total: parseInt(deviceData.total) || 0,
        online: parseInt(deviceData.online) || 0,
        offline: parseInt(deviceData.offline) || 0,
        error: parseInt(deviceData.error) || 0,
        maintenance: parseInt(deviceData.maintenance) || 0,
      },
      users: {
        total: parseInt(userData.total) || 0,
        active: parseInt(userData.active) || 0,
        inactive: parseInt(userData.inactive) || 0,
        byRole,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if user can subscribe to general stats
   */
  public canSubscribeToGeneralStats(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || 
           userRole === UserRole.DEV_ADMIN || 
           userRole === UserRole.FACILITY_ADMIN;
  }
}
