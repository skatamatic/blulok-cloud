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
 * - Direct lock access: lock:{lockSerial}
 * - Shared access:      shared_key:{primaryTenantId}:{lockSerial}
 * - App entry access:   access_control:{deviceId}
 *
 * Privileged management roles (admin, dev_admin, facility_admin) receive an
 * empty `aud` — devices authorize those roles via `user_role` so the claim
 * does not explode with every lock / access-control device in scope.
 */
export class AudienceResolver {
  public static async resolve(db: Knex, params: {
    userId: string;
    userRole: UserRole;
    facilityIds?: string[];
    facilityId?: string;
  }): Promise<string[]> {
    const { userId, userRole, facilityId } = params;

    if (
      userRole === UserRole.DEV_ADMIN ||
      userRole === UserRole.ADMIN ||
      userRole === UserRole.FACILITY_ADMIN
    ) {
      return [];
    }

    if (userRole === UserRole.TENANT || userRole === UserRole.MAINTENANCE) {
      let audiences: string[] = [];

      // Direct (assigned) locks
      const assignedQuery = db('blulok_devices as bd')
        .join('unit_assignments as ua', 'ua.unit_id', 'bd.unit_id')
        .where('ua.tenant_id', userId)
        .where(function(this: any) {
          this.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', db.fn.now());
        })
        .select('bd.device_serial');
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
        .select('bd.device_serial as device_serial', 'ks.primary_tenant_id as owner_user_id');
      if (facilityId) {
        sharedQuery.join('units as u', 'u.id', 'ks.unit_id');
        sharedQuery.andWhere('u.facility_id', facilityId);
      }
      const sharedRows = await sharedQuery;

      const assignedLockSerials = assignedRows.map((r: any) => r.device_serial as string);
      audiences.push(...assignedLockSerials.map((serial: string) => `lock:${serial}`));

      for (const row of sharedRows as any[]) {
        const deviceSerial = row.device_serial as string;
        const ownerUserId = String(row.owner_user_id);
        if (ownerUserId && deviceSerial) audiences.push(`shared_key:${ownerUserId}:${deviceSerial}`);
      }

      const appEntryDeviceIds = (await AppEntryAccessService.resolveDeviceIds(db, params)) || [];
      audiences.push(...appEntryDeviceIds.map((id) => `access_control:${id}`));

      return Array.from(new Set(audiences));
    }

    // Other roles: no access
    return [];
  }
}
