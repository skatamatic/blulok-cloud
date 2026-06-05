import { DatabaseService } from '@/services/database.service';
import { DenylistDeviceTarget, DenylistDeviceType } from '@/types/denylist.types';

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
   */
  public static async getDenylistTargetsForUnits(unitIds: string[]): Promise<DenylistDeviceTarget[]> {
    const bluLokDeviceIds = await this.getBluLokDeviceIdsForUnits(unitIds);
    const accessControlDeviceIds = await this.getAppEnabledAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds);
    return [
      ...bluLokDeviceIds.map((device_id) => ({ device_id, device_type: 'blulok' as const })),
      ...accessControlDeviceIds.map((device_id) => ({ device_id, device_type: 'access_control' as const })),
    ];
  }

  /** @deprecated Prefer getDenylistTargetsForUnits — returns device IDs only. */
  public static async getDenylistDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    const targets = await this.getDenylistTargetsForUnits(unitIds);
    return targets.map((target) => target.device_id);
  }

  public static async getAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds: string[]): Promise<string[]> {
    if (bluLokDeviceIds.length === 0) return [];
    const rows = await this.db('device_group_members as zone_access')
      .distinct('zone_access.device_id')
      .join('device_groups as dg', 'dg.id', 'zone_access.group_id')
      .join('device_group_members as zone_lock', 'zone_lock.group_id', 'dg.id')
      .where('dg.group_type', 'zone')
      .andWhere('dg.is_active', true)
      .andWhere('zone_access.device_type', 'access_control')
      .andWhere('zone_lock.device_type', 'blulok')
      .whereIn('zone_lock.device_id', bluLokDeviceIds);
    return rows.map((row) => String(row.device_id));
  }

  public static async getAppEnabledAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds: string[]): Promise<string[]> {
    if (bluLokDeviceIds.length === 0) return [];
    const rows = await this.db('device_group_members as zone_access')
      .distinct('zone_access.device_id')
      .join('device_groups as dg', 'dg.id', 'zone_access.group_id')
      .join('device_group_members as zone_lock', 'zone_lock.group_id', 'dg.id')
      .join('access_control_devices as acd', 'acd.id', 'zone_access.device_id')
      .where('dg.group_type', 'zone')
      .andWhere('dg.is_active', true)
      .andWhere('zone_access.device_type', 'access_control')
      .andWhere('zone_lock.device_type', 'blulok')
      .whereIn('zone_lock.device_id', bluLokDeviceIds)
      .whereRaw(`JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`);
    return rows.map((row) => String(row.device_id));
  }

  public static async getAccessControlDeviceIdsForUnits(unitIds: string[]): Promise<string[]> {
    const bluLokDeviceIds = await this.getBluLokDeviceIdsForUnits(unitIds);
    return this.getAccessControlDeviceIdsForBluLokDevices(bluLokDeviceIds);
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

