import { UserRole } from '@/types/auth.types';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import type { Knex } from 'knex';

/**
 * Facility Access Service
 *
 * Centralized service for managing facility-scoped access control across the entire BluLok system.
 * All facility ID resolution reads live DB state — JWT `facilityIds` claims are never authoritative.
 *
 * Access Control Model:
 * - DEV_ADMIN, ADMIN: Global access to all facilities
 * - FACILITY_ADMIN: Explicit user_facility_associations rows
 * - TENANT, MAINTENANCE: Active unit_assignments and key_sharing (not association rows alone)
 * - ZTP gateway principals (`ztp:{gatewayId}`): scoped to the live bound facility on that gateway row
 */
export class FacilityAccessService {
  /** Synthetic principal minted for ECDSA gateway AUTH (`ztp:{gatewayId}`). */
  static isZtpGatewayPrincipal(userId: string): boolean {
    return typeof userId === 'string' && userId.startsWith('ztp:');
  }

  /**
   * Resolve the live facility for a ZTP gateway principal from the gateways table.
   * Returns null when unbound, revoked, or not a ZTP principal.
   */
  static async getZtpPrincipalFacilityId(userId: string): Promise<string | null> {
    if (!this.isZtpGatewayPrincipal(userId)) return null;
    const gatewayId = userId.slice('ztp:'.length);
    if (!gatewayId) return null;
    try {
      const db = DatabaseService.getInstance().connection;
      const row = await db('gateways')
        .where({ id: gatewayId })
        .whereNull('revoked_at')
        .first('facility_id');
      return row?.facility_id ? String(row.facility_id) : null;
    } catch (error) {
      logger.error(`Error resolving ZTP principal facility for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get facility IDs that a user has access to based on their role.
   * @returns Empty array for global admins (means all facilities). Otherwise scoped IDs.
   */
  static async getUserFacilityIds(userId: string, userRole: UserRole): Promise<string[]> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return [];
      }

      if (userRole === UserRole.TENANT || userRole === UserRole.MAINTENANCE) {
        return this.getTenantMaintenanceFacilityIds(userId);
      }

      const ztpFacilityId = await this.getZtpPrincipalFacilityId(userId);
      if (ztpFacilityId) {
        return [ztpFacilityId];
      }
      if (this.isZtpGatewayPrincipal(userId)) {
        logger.warn(`ZTP principal ${userId} has no bound facility`);
        return [];
      }

      const facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
      if (facilityIds.length === 0) {
        logger.warn(`User ${userId} with role ${userRole} has no facility associations`);
      }
      return facilityIds;
    } catch (error) {
      logger.error(`Error getting facility IDs for user ${userId}:`, error);
      throw error;
    }
  }

  static async hasAccessToFacility(userId: string, userRole: UserRole, facilityId: string): Promise<boolean> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      if (userRole === UserRole.TENANT || userRole === UserRole.MAINTENANCE) {
        return this.tenantHasFacilityAccess(userId, facilityId);
      }

      const ztpFacilityId = await this.getZtpPrincipalFacilityId(userId);
      if (ztpFacilityId) {
        return ztpFacilityId === facilityId;
      }
      if (this.isZtpGatewayPrincipal(userId)) {
        return false;
      }

      return await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
    } catch (error) {
      logger.error(`Error checking facility access for user ${userId} to facility ${facilityId}:`, error);
      return false;
    }
  }

  static async getUserScope(userId: string, userRole: UserRole): Promise<{
    type: 'all' | 'facility_limited';
    facilityIds?: string[];
  }> {
    try {
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return { type: 'all' };
      }

      const facilityIds = await this.getUserFacilityIds(userId, userRole);
      if (facilityIds.length === 0) {
        logger.warn(`User ${userId} with role ${userRole} has no accessible facilities`);
        return { type: 'facility_limited', facilityIds: [] };
      }

      return { type: 'facility_limited', facilityIds };
    } catch (error) {
      logger.error(`Error getting user scope for user ${userId}:`, error);
      throw error;
    }
  }

  static async validateFacilityAccess(
    userId: string,
    userRole: UserRole,
    facilityId: string,
    operation: string = 'access'
  ): Promise<boolean> {
    try {
      const hasAccess = await this.hasAccessToFacility(userId, userRole, facilityId);

      if (!hasAccess) {
        logger.warn(`Access denied: User ${userId} (${userRole}) attempted to ${operation} facility ${facilityId}`);
      } else {
        logger.debug(`Access granted: User ${userId} (${userRole}) ${operation} facility ${facilityId}`);
      }

      return hasAccess;
    } catch (error) {
      logger.error(`Error validating facility access for user ${userId} to facility ${facilityId}:`, error);
      return false;
    }
  }

  static async getAccessInfo(userId: string, userRole: UserRole): Promise<{
    role: UserRole;
    scope: 'all' | 'facility_limited';
    facilityIds: string[];
    facilityCount: number;
  }> {
    try {
      const scope = await this.getUserScope(userId, userRole);
      const facilityIds = scope.type === 'all' ? [] : (scope.facilityIds || []);

      return {
        role: userRole,
        scope: scope.type,
        facilityIds,
        facilityCount: facilityIds.length,
      };
    } catch (error) {
      logger.error(`Error getting access info for user ${userId}:`, error);
      return {
        role: userRole,
        scope: 'facility_limited',
        facilityIds: [],
        facilityCount: 0,
      };
    }
  }

  /** Live facility IDs for tenants/maintenance from unit assignments and active key shares. */
  static async getTenantMaintenanceFacilityIds(userId: string): Promise<string[]> {
    const db = DatabaseService.getInstance().connection;
    const [unitFacilityRows, sharedFacilityRows] = await Promise.all([
      this.queryAssignmentFacilityIds(db, userId),
      this.queryKeyShareFacilityIds(db, userId),
    ]);
    return Array.from(
      new Set([...unitFacilityRows, ...sharedFacilityRows].filter(Boolean))
    );
  }

  private static async tenantHasFacilityAccess(userId: string, facilityId: string): Promise<boolean> {
    const db = DatabaseService.getInstance().connection;
    const now = new Date();

    const assignment = await db('unit_assignments as ua')
      .join('units as u', 'u.id', 'ua.unit_id')
      .where('ua.tenant_id', userId)
      .where('u.facility_id', facilityId)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', now);
      })
      .first();

    if (assignment) {
      return true;
    }

    const share = await db('key_sharing as ks')
      .join('units as u', 'u.id', 'ks.unit_id')
      .where('ks.shared_with_user_id', userId)
      .where('u.facility_id', facilityId)
      .where('ks.is_active', true)
      .where((qb) => {
        qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', now);
      })
      .first();

    return !!share;
  }

  private static queryAssignmentFacilityIds(db: Knex, userId: string): Promise<string[]> {
    const now = new Date();
    return db('unit_assignments as ua')
      .select('u.facility_id')
      .join('units as u', 'u.id', 'ua.unit_id')
      .where('ua.tenant_id', userId)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', now);
      })
      .then((rows) => rows.map((r) => r.facility_id as string));
  }

  private static queryKeyShareFacilityIds(db: Knex, userId: string): Promise<string[]> {
    const now = new Date();
    return db('key_sharing as ks')
      .select('u.facility_id')
      .join('units as u', 'u.id', 'ks.unit_id')
      .where('ks.shared_with_user_id', userId)
      .where('ks.is_active', true)
      .where((qb) => {
        qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', now);
      })
      .then((rows) => rows.map((r) => r.facility_id as string));
  }
}
