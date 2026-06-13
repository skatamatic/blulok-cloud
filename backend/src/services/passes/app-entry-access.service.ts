import type { Knex } from 'knex';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';

type ResolveParams = {
  userId: string;
  userRole: UserRole;
  facilityIds?: string[];
  facilityId?: string;
};

/**
 * Resolves app-entry capable access-control device IDs that a user can access.
 * Entitlements are zone-driven for tenant-like users and facility-scoped for admins.
 */
export class AppEntryAccessService {
  private static applyFacilityScope(
    qb: Knex.QueryBuilder,
    db: Knex,
    column: string,
    facilityIds?: string[],
    facilityId?: string,
  ): void {
    if (facilityId) {
      qb.andWhere(column, facilityId);
      return;
    }
    if (facilityIds && facilityIds.length > 0) {
      qb.whereIn(column, facilityIds);
    }
  }

  private static async getTenantAccessibleBluLokDeviceIds(
    db: Knex,
    userId: string,
    facilityId?: string,
  ): Promise<string[]> {
    const assignedRowsQb = db('unit_assignments as ua')
      .select('bd.id as device_id')
      .join('units as u', 'u.id', 'ua.unit_id')
      .join('blulok_devices as bd', 'bd.unit_id', 'u.id')
      .where('ua.tenant_id', userId)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', db.fn.now());
      });

    if (facilityId) {
      assignedRowsQb.andWhere('u.facility_id', facilityId);
    }

    const sharedRowsQb = db('key_sharing as ks')
      .select('bd.id as device_id')
      .join('units as u', 'u.id', 'ks.unit_id')
      .join('blulok_devices as bd', 'bd.unit_id', 'u.id')
      .where('ks.shared_with_user_id', userId)
      .andWhere('ks.is_active', true)
      .where((qb) => {
        qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', db.fn.now());
      });

    if (facilityId) {
      sharedRowsQb.andWhere('u.facility_id', facilityId);
    }

    const [assignedRows, sharedRows] = await Promise.all([assignedRowsQb, sharedRowsQb]);
    return Array.from(new Set([...assignedRows, ...sharedRows].map((row) => String(row.device_id))));
  }

  public static async resolveDeviceIds(db: Knex, params: ResolveParams): Promise<string[]> {
    const { userId, userRole, facilityIds, facilityId } = params;

    if (AuthService.canAccessAllFacilities(userRole)) {
      const rowsQb = db('access_control_devices as acd')
        .select('acd.id')
        .join('gateways as g', 'g.id', 'acd.gateway_id')
        .whereRaw(`JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`)
        .orderBy('acd.id', 'asc');
      if (facilityId) {
        rowsQb.where('g.facility_id', facilityId);
      }
      const rows = await rowsQb;
      return rows.map((row: any) => String(row.id));
    }

    if (userRole === UserRole.FACILITY_ADMIN) {
      if (!facilityId && (!facilityIds || facilityIds.length === 0)) {
        return [];
      }
      const rowsQb = db('access_control_devices as acd')
        .select('acd.id')
        .join('gateways as g', 'g.id', 'acd.gateway_id')
        .whereRaw(`JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`)
        .orderBy('acd.id', 'asc');
      this.applyFacilityScope(rowsQb, db, 'g.facility_id', facilityIds, facilityId);
      const rows = await rowsQb;
      return rows.map((row: any) => String(row.id));
    }

    if (userRole !== UserRole.TENANT && userRole !== UserRole.MAINTENANCE) {
      return [];
    }

    const accessibleBluLokIds = await this.getTenantAccessibleBluLokDeviceIds(db, userId, facilityId);
    if (accessibleBluLokIds.length === 0) return [];

    // Resolve access-control devices in the same active zone groups as accessible locks.
    const rowsQb = db('device_group_members as zone_access')
      .distinct('acd.id')
      .join('device_groups as dg', 'dg.id', 'zone_access.group_id')
      .join('device_group_members as zone_lock', 'zone_lock.group_id', 'dg.id')
      .join('access_control_devices as acd', 'acd.id', 'zone_access.device_id')
      .join('gateways as g', 'g.id', 'acd.gateway_id')
      .where('dg.group_type', 'zone')
      .andWhere('dg.is_active', true)
      .andWhere('zone_access.device_type', 'access_control')
      .andWhere('zone_lock.device_type', 'blulok')
      .whereIn('zone_lock.device_id', accessibleBluLokIds)
      .whereRaw(`JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`)
      .orderBy('acd.id', 'asc');

    this.applyFacilityScope(rowsQb, db, 'dg.facility_id', facilityIds, facilityId);
    const rows = await rowsQb;
    return rows.map((row: any) => String(row.id));
  }
}

