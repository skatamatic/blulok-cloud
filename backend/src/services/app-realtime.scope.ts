import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { DatabaseService } from '@/services/database.service';
import type { AppRealtimeClient } from '@/services/app-realtime.types';

/**
 * Assert the user may subscribe to app realtime for a facility.
 */
export async function assertAppFacilityAccess(
  userId: string,
  userRole: UserRole,
  facilityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!facilityId || typeof facilityId !== 'string') {
    return { ok: false, error: 'facility_id is required' };
  }
  const hasAccess = await FacilityAccessService.hasAccessToFacility(userId, userRole, facilityId);
  if (!hasAccess) {
    return { ok: false, error: 'Access denied to facility' };
  }
  return { ok: true };
}

export function clientCanAccessFacility(client: AppRealtimeClient, facilityId: string): boolean {
  if (AuthService.canAccessAllFacilities(client.userRole)) {
    return true;
  }
  return (client.facilityIds ?? []).includes(facilityId);
}

/**
 * Unit IDs the user can access within a facility (assignments + active key shares).
 * Used to tighten tenant/maintenance device_status fanout on `/ws/app`.
 */
export async function getAccessibleUnitIdsForFacility(
  userId: string,
  userRole: UserRole,
  facilityId: string,
): Promise<Set<string>> {
  if (userRole !== UserRole.TENANT && userRole !== UserRole.MAINTENANCE) {
    return new Set();
  }

  const db = DatabaseService.getInstance().connection;
  const now = new Date();

  const [assigned, shared] = await Promise.all([
    db('unit_assignments as ua')
      .select('ua.unit_id')
      .join('units as u', 'u.id', 'ua.unit_id')
      .where('ua.tenant_id', userId)
      .where('u.facility_id', facilityId)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', now);
      }),
    db('key_sharing as ks')
      .select('ks.unit_id')
      .join('units as u', 'u.id', 'ks.unit_id')
      .where('ks.shared_with_user_id', userId)
      .where('u.facility_id', facilityId)
      .where('ks.is_active', true)
      .where((qb) => {
        qb.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', now);
      }),
  ]);

  return new Set([
    ...assigned.map((r: { unit_id: string }) => r.unit_id),
    ...shared.map((r: { unit_id: string }) => r.unit_id),
  ]);
}

/** Whether a device row should be delivered on an app subscription. */
export function canReceiveDeviceOnAppStream(
  client: AppRealtimeClient,
  device: { facility_id?: string | null; unit_id?: string | null },
): boolean {
  if (!client.facilityId) return false;
  if (device.facility_id && device.facility_id !== client.facilityId) return false;

  if (client.userRole === UserRole.TENANT || client.userRole === UserRole.MAINTENANCE) {
    // Access-control / facility-level devices without unit_id: operators only for tenants.
    // Tenants only receive devices bound to their accessible units.
    if (!device.unit_id) return false;
    return client.accessibleUnitIds?.has(device.unit_id) ?? false;
  }

  return true;
}

/** Activity rows: tenants see own units or own actor; maintenance sees own actor. */
export function canReceiveActivityOnAppStream(
  client: AppRealtimeClient,
  activity: {
    facilityId?: string | null;
    unitId?: string | null;
    actor?: { id?: string | null } | null;
  },
): boolean {
  if (activity.facilityId && activity.facilityId !== client.facilityId) return false;

  if (client.userRole === UserRole.TENANT) {
    const actorSelf = activity.actor?.id === client.userId;
    const unitOk = activity.unitId ? (client.accessibleUnitIds?.has(activity.unitId) ?? false) : false;
    return actorSelf || unitOk;
  }

  if (client.userRole === UserRole.MAINTENANCE) {
    return activity.actor?.id === client.userId;
  }

  return true;
}

/**
 * Whether a units_update should be delivered on an app subscription.
 *
 * - Always facility-scoped when `facilityId` is known.
 * - Tenants / maintenance: only when a specific accessible `unitId` changed.
 *   Facility-wide refreshes (`unitId` omitted) and facility-level devices
 *   (`unitId: null`) are operator-facing and must not notify unit-scoped roles
 *   (avoids activity side-channels on unrelated units).
 */
export function canReceiveUnitsUpdateOnAppStream(
  client: AppRealtimeClient,
  scope: { facilityId?: string | null; unitId?: string | null } = {},
): boolean {
  if (!client.facilityId) return false;
  if (scope.facilityId && scope.facilityId !== client.facilityId) return false;

  if (client.userRole === UserRole.TENANT || client.userRole === UserRole.MAINTENANCE) {
    if (!scope.unitId) return false;
    return client.accessibleUnitIds?.has(scope.unitId) ?? false;
  }

  return true;
}
