import { Knex } from 'knex';
import { UserRole } from '@/types/auth.types';

/**
 * AudienceResolver
 *
 * Computes audience strings for a route pass request based on the user's role,
 * assignments, and key-sharing relationships.
 *
 * Audience formats:
 * - Direct lock access: lock:{lockId}
 * - Shared access:      shared_key:{primaryTenantId}:{lockId}
 */
export class AudienceResolver {
  public static async resolve(db: Knex, params: {
    userId: string;
    userRole: UserRole;
    facilityIds?: string[];
  }): Promise<string[]> {
    const { userId, userRole, facilityIds } = params;
    let audiences: string[] = [];

    if (userRole === UserRole.DEV_ADMIN || userRole === UserRole.ADMIN) {
      const rows = await db('blulok_devices').select('id');
      const lockIds = rows.map((r: any) => r.id as string);
      audiences = lockIds.map((id: string) => `lock:${id}`);
      return audiences;
    }

    if (userRole === UserRole.FACILITY_ADMIN) {
      if (!facilityIds || facilityIds.length === 0) {
        return [];
      }
      const rows = await db('blulok_devices as bd')
        .join('units as u', 'bd.unit_id', 'u.id')
        .whereIn('u.facility_id', facilityIds)
        .select('bd.id');
      const lockIds = rows.map((r: any) => r.id as string);
      audiences = lockIds.map((id: string) => `lock:${id}`);
      return audiences;
    }

    if (userRole === UserRole.TENANT) {
      // Direct (assigned) locks
      const assignedRows = await db('blulok_devices as bd')
        .join('unit_assignments as ua', 'ua.unit_id', 'bd.unit_id')
        .where('ua.tenant_id', userId)
        .select('bd.id');

      // Shared locks (active, unexpired)
      const sharedRows = await db('blulok_devices as bd')
        .join('key_sharing as ks', 'ks.unit_id', 'bd.unit_id')
        .where('ks.shared_with_user_id', userId)
        .where('ks.is_active', true)
        .where(function(this: any) {
          this.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', db.fn.now());
        })
        .select('bd.id as device_id', 'ks.primary_tenant_id as owner_user_id');

      const assignedLockIds = assignedRows.map((r: any) => r.id as string);
      audiences.push(...assignedLockIds.map((id: string) => `lock:${id}`));

      for (const row of sharedRows as any[]) {
        const deviceId = row.device_id as string;
        const ownerUserId = String(row.owner_user_id);
        if (ownerUserId && deviceId) audiences.push(`shared_key:${ownerUserId}:${deviceId}`);
      }

      // Deduplicate
      audiences = Array.from(new Set(audiences));
      return audiences;
    }

    // Other roles: no access
    return [];
  }
}


