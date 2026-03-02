import { Knex } from 'knex';
import { UserRole } from '@/types/auth.types';
import { AppEntryAccessService } from '@/services/passes/app-entry-access.service';

/**
 * AudienceResolver
 *
 * Computes audience strings for a route pass request based on the user's role,
 * assignments, and key-sharing relationships.
 *
 * Audience formats:
 * - Direct lock access: lock:{lockId}
 * - Shared access:      shared_key:{primaryTenantId}:{lockId}
 * - App entry access:   access_control:{deviceId}
 */
export class AudienceResolver {
  public static async resolve(db: Knex, params: {
    userId: string;
    userRole: UserRole;
    facilityIds?: string[];
    facilityId?: string;
  }): Promise<string[]> {
    const { userId, userRole, facilityIds, facilityId } = params;
    let audiences: string[] = [];

    if (userRole === UserRole.DEV_ADMIN || userRole === UserRole.ADMIN) {
      const rowsQb = db('blulok_devices as bd');
      if (facilityId) {
        rowsQb.join('units as u', 'bd.unit_id', 'u.id').where('u.facility_id', facilityId);
      }
      const rows = await rowsQb.select('bd.id');
      const lockIds = rows.map((r: any) => r.id as string);
      audiences = lockIds.map((id: string) => `lock:${id}`);
      const appEntryDeviceIds = (await AppEntryAccessService.resolveDeviceIds(db, params)) || [];
      audiences.push(...appEntryDeviceIds.map((id) => `access_control:${id}`));
      return Array.from(new Set(audiences));
    }

    if (userRole === UserRole.FACILITY_ADMIN) {
      const scopedFacilityIds = facilityId ? [facilityId] : facilityIds;
      if (!scopedFacilityIds || scopedFacilityIds.length === 0) {
        return [];
      }
      const rows = await db('blulok_devices as bd')
        .join('units as u', 'bd.unit_id', 'u.id')
        .whereIn('u.facility_id', scopedFacilityIds)
        .select('bd.id');
      const lockIds = rows.map((r: any) => r.id as string);
      audiences = lockIds.map((id: string) => `lock:${id}`);
      const appEntryDeviceIds = (await AppEntryAccessService.resolveDeviceIds(db, {
        ...params,
        facilityIds: scopedFacilityIds,
      })) || [];
      audiences.push(...appEntryDeviceIds.map((id) => `access_control:${id}`));
      return Array.from(new Set(audiences));
    }

    if (userRole === UserRole.TENANT || userRole === UserRole.MAINTENANCE) {
      // Direct (assigned) locks
      const assignedQuery = db('blulok_devices as bd')
        .join('unit_assignments as ua', 'ua.unit_id', 'bd.unit_id')
        .where('ua.tenant_id', userId)
        .where(function(this: any) {
          this.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', db.fn.now());
        })
        .select('bd.id');
      if (facilityId) {
        assignedQuery.join('units as u', 'u.id', 'ua.unit_id');
        assignedQuery.andWhere('u.facility_id', facilityId);
      }
      const assignedRows = await assignedQuery;

      // Shared locks (active, unexpired)
      const sharedQuery = db('blulok_devices as bd')
        .join('key_sharing as ks', 'ks.unit_id', 'bd.unit_id')
        .where('ks.shared_with_user_id', userId)
        .where('ks.is_active', true)
        .where(function(this: any) {
          this.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', db.fn.now());
        })
        .select('bd.id as device_id', 'ks.primary_tenant_id as owner_user_id');
      if (facilityId) {
        sharedQuery.join('units as u', 'u.id', 'ks.unit_id');
        sharedQuery.andWhere('u.facility_id', facilityId);
      }
      const sharedRows = await sharedQuery;

      const assignedLockIds = assignedRows.map((r: any) => r.id as string);
      audiences.push(...assignedLockIds.map((id: string) => `lock:${id}`));

      for (const row of sharedRows as any[]) {
        const deviceId = row.device_id as string;
        const ownerUserId = String(row.owner_user_id);
        if (ownerUserId && deviceId) audiences.push(`shared_key:${ownerUserId}:${deviceId}`);
      }

      const appEntryDeviceIds = (await AppEntryAccessService.resolveDeviceIds(db, params)) || [];
      audiences.push(...appEntryDeviceIds.map((id) => `access_control:${id}`));

      // Deduplicate
      audiences = Array.from(new Set(audiences));
      return audiences;
    }

    // Other roles: no access
    return [];
  }
}


