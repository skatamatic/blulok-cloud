import { DatabaseService } from '@/services/database.service';
import { DenylistDeviceTarget, DenylistDeviceType } from '@/types/denylist.types';
import { applyBlulokZoneLockMatch, type BluLokZoneLockMatch } from '@/utils/blulok-zone-lock-match.utils';

export type { DenylistDeviceTarget, DenylistDeviceType };

/**
 * Shared helper for resolving zone-linked access-control device entitlements from unit/lock context.
 */
export class AccessControlZoneAccessService {
  private static get db() {
    return DatabaseService.getInstance().connection;
  }

  public static async getBluLokDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    if (unitIds.length === 0) return [];
    const rows = await this.db('blulok_devices')
      .select('id')
      .whereIn('unit_id', unitIds);
    return rows.map((row) => String(row.id));
  }

  /**
   * BluLok locks plus app-enabled zone-linked access_control devices entitled for denylist
   * revocation on a unit (offline lock unlock + app-entry route pass validation).
   * Does not include facility-wide default group devices — use user-scoped helpers below.
   */
  public static async getDenylistTargetsForUnits(unitIds: string[]): Promise<DenylistDeviceTarget[]> {
    const bluLokDeviceIds = await this.getBluLokDeviceIdsForUnits(unitIds);
    const scopedAccessControlIds = await this.getAppEnabledAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds);

    return [
      ...bluLokDeviceIds.map((device_id) => ({ device_id, device_type: 'blulok' as const })),
      ...scopedAccessControlIds.map((device_id) => ({ device_id, device_type: 'access_control' as const })),
    ];
  }

  /**
   * Denylist targets when revoking unit access for a user. Includes default-group
   * access-control devices only for facilities where the user loses all remaining unit/key-share access.
   */
  public static async getDenylistTargetsForUserRevocation(
    unitIds: string[],
    userId: string,
  ): Promise<DenylistDeviceTarget[]> {
    const scopedTargets = await this.getDenylistTargetsForUnits(unitIds);
    const globalTargets = await this.getGlobalDenylistTargetsWhenFacilityAccessLost(unitIds, userId);
    return this.mergeDenylistTargets(scopedTargets, globalTargets);
  }

  /**
   * Denylist targets to clear when granting/re-granting unit access. Includes default-group devices
   * for facilities where the user currently has active access (e.g. after re-assignment).
   */
  public static async getDenylistRemovalTargetsForUserGrant(
    unitIds: string[],
    userId: string,
  ): Promise<DenylistDeviceTarget[]> {
    const scopedTargets = await this.getDenylistTargetsForUnits(unitIds);
    if (unitIds.length === 0) return scopedTargets;

    const facilityRows = await this.db('units')
      .distinct('facility_id')
      .whereIn('id', unitIds);
    const facilityIds = facilityRows.map((row) => String(row.facility_id));

    const facilitiesWithAccess: string[] = [];
    for (const facilityId of facilityIds) {
      const hasAccess = await this.userHasActiveUnitAccessInFacility(userId, facilityId, []);
      if (hasAccess) {
        facilitiesWithAccess.push(facilityId);
      }
    }

    const defaultDeviceIds = await this.getDefaultGroupAccessControlDeviceIdsForFacilities(facilitiesWithAccess);
    const defaultTargets = defaultDeviceIds.map((device_id) => ({
      device_id,
      device_type: 'access_control' as const,
    }));
    return this.mergeDenylistTargets(scopedTargets, defaultTargets);
  }

  private static mergeDenylistTargets(
    ...targetLists: DenylistDeviceTarget[][]
  ): DenylistDeviceTarget[] {
    const seen = new Set<string>();
    const merged: DenylistDeviceTarget[] = [];
    for (const targets of targetLists) {
      for (const target of targets) {
        const key = `${target.device_type}:${target.device_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(target);
      }
    }
    return merged;
  }

  private static async getGlobalDenylistTargetsWhenFacilityAccessLost(
    unitIds: string[],
    userId: string,
  ): Promise<DenylistDeviceTarget[]> {
    if (unitIds.length === 0) return [];

    const facilityRows = await this.db('units')
      .distinct('facility_id')
      .whereIn('id', unitIds);
    const facilityIds = facilityRows.map((row) => String(row.facility_id));

    const lostFacilityIds: string[] = [];
    for (const facilityId of facilityIds) {
      const stillHasAccess = await this.userHasActiveUnitAccessInFacility(userId, facilityId, unitIds);
      if (!stillHasAccess) {
        lostFacilityIds.push(facilityId);
      }
    }

    const defaultDeviceIds = await this.getDefaultGroupAccessControlDeviceIdsForFacilities(lostFacilityIds);
    return defaultDeviceIds.map((device_id) => ({
      device_id,
      device_type: 'access_control' as const,
    }));
  }

  private static async userHasActiveUnitAccessInFacility(
    userId: string,
    facilityId: string,
    excludeUnitIds: string[],
  ): Promise<boolean> {
    const primaryQuery = this.db('unit_assignments as ua')
      .join('units as u', 'u.id', 'ua.unit_id')
      .where('u.facility_id', facilityId)
      .where('ua.tenant_id', userId)
      .where((qb) => {
        qb.whereNull('ua.access_expires_at').orWhere('ua.access_expires_at', '>', this.db.fn.now());
      });
    if (excludeUnitIds.length > 0) {
      primaryQuery.whereNotIn('u.id', excludeUnitIds);
    }
    const primaryRow = await primaryQuery.count<{ count: string | number }[]>('* as count').first();
    if (Number(primaryRow?.count ?? 0) > 0) return true;

    const shareQuery = this.db('key_sharing as ks')
      .join('units as u', 'u.id', 'ks.unit_id')
      .where('u.facility_id', facilityId)
      .where('ks.shared_with_user_id', userId)
      .where('ks.is_active', true)
      .where(function excludeExpiredShares(this: any) {
        this.whereNull('ks.expires_at').orWhere('ks.expires_at', '>', AccessControlZoneAccessService.db.fn.now());
      });
    if (excludeUnitIds.length > 0) {
      shareQuery.whereNotIn('u.id', excludeUnitIds);
    }
    const shareRow = await shareQuery.count<{ count: string | number }[]>('* as count').first();
    return Number(shareRow?.count ?? 0) > 0;
  }

  /** @deprecated Prefer getDenylistTargetsForUnits — returns device IDs only. */
  public static async getDenylistDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    const targets = await this.getDenylistTargetsForUnits(unitIds);
    return targets.map((target) => target.device_id);
  }

  public static async getAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds: string[]): Promise<string[]> {
    return this.resolveScopedAccessControlDeviceIds({ bluLokDeviceIds });
  }

  public static async getAppEnabledAccessControlDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    return this.resolveScopedAccessControlDeviceIds({ unitIds }, { appEnabledOnly: true });
  }

  public static async getAppEnabledAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds: string[]): Promise<string[]> {
    return this.resolveScopedAccessControlDeviceIds({ bluLokDeviceIds }, { appEnabledOnly: true });
  }

  private static async resolveScopedAccessControlDeviceIds(
    match: BluLokZoneLockMatch,
    options?: { appEnabledOnly?: boolean },
  ): Promise<string[]> {
    const unitIds = (match.unitIds ?? []).filter(Boolean);
    const bluLokDeviceIds = (match.bluLokDeviceIds ?? []).filter(Boolean);
    if (unitIds.length === 0 && bluLokDeviceIds.length === 0) return [];

    const rowsQb = this.db('device_group_members as zone_access')
      .distinct('zone_access.device_id')
      .join('device_groups as dg', 'dg.id', 'zone_access.group_id')
      .join('device_group_members as zone_lock', 'zone_lock.group_id', 'dg.id')
      .where('dg.is_active', true)
      .andWhere('dg.is_default', false)
      .andWhere('zone_access.device_type', 'access_control')
      .andWhere('zone_lock.device_type', 'blulok');

    if (options?.appEnabledOnly) {
      rowsQb
        .join('access_control_devices as acd', 'acd.id', 'zone_access.device_id')
        .whereRaw(`JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`);
    }

    applyBlulokZoneLockMatch(rowsQb, 'zone_lock', { unitIds, bluLokDeviceIds });
    const rows = await rowsQb;
    return rows.map((row) => String(row.device_id));
  }

  public static async getDefaultGroupAccessControlDeviceIdsForFacilities(
    facilityIds: string[],
  ): Promise<string[]> {
    if (facilityIds.length === 0) return [];
    const rows = await this.db('device_group_members as m')
      .distinct('m.device_id')
      .join('device_groups as dg', 'dg.id', 'm.group_id')
      .whereIn('dg.facility_id', facilityIds)
      .andWhere('dg.is_active', true)
      .andWhere('dg.is_default', true)
      .andWhere('m.device_type', 'access_control');
    return rows.map((row) => String(row.device_id));
  }

  /** @deprecated Use getDefaultGroupAccessControlDeviceIdsForFacilities */
  public static async getGlobalSharedAccessControlDeviceIdsForFacilities(
    facilityIds: string[],
  ): Promise<string[]> {
    return this.getDefaultGroupAccessControlDeviceIdsForFacilities(facilityIds);
  }

  public static async getAccessControlDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    return this.resolveScopedAccessControlDeviceIds({ unitIds });
  }

  public static async getDeviceFacilityIds(deviceIds: string[]): Promise<Map<string, string>> {
    if (deviceIds.length === 0) return new Map();
    const [blulokRows, accessControlRows] = await Promise.all([
      this.db('blulok_devices as bd')
        .join('units as u', 'bd.unit_id', 'u.id')
        .select('bd.id as device_id', 'u.facility_id')
        .whereIn('bd.id', deviceIds),
      this.db('access_control_devices as acd')
        .join('gateways as g', 'acd.gateway_id', 'g.id')
        .select('acd.id as device_id', 'g.facility_id')
        .whereIn('acd.id', deviceIds),
    ]);

    const map = new Map<string, string>();
    [...blulokRows, ...accessControlRows].forEach((row) => {
      map.set(String(row.device_id), String(row.facility_id));
    });
    return map;
  }
}

