import { DeviceModel } from '@/models/device.model';
import { DenylistEntryModel, DeviceDenylistEntry } from '@/models/denylist-entry.model';

/** Denylist row pushed to gateways (matches JWT denylist_add entry shape). */
export type DenylistSyncEntry = {
  sub: string;
  exp: number;
};

/** Per operational device denylist state returned on inventory sync. */
export type OperationalDeviceDenylistSync = {
  cloud_device_id: string;
  kind: 'lock' | 'access_control';
  serial: string;
  relay_channel?: number | null;
  denylist: DenylistSyncEntry[];
};

/** Permanent denylist entries use a far-future exp when DB expires_at is null. */
const PERMANENT_DENYLIST_EXP = 4_102_444_800; // 2100-01-01T00:00:00Z

export class DenylistSyncService {
  private static denylistModel: DenylistEntryModel | undefined;
  private static deviceModel: DeviceModel | undefined;

  private static getDenylistModel(): DenylistEntryModel {
    if (!this.denylistModel) {
      this.denylistModel = new DenylistEntryModel();
    }
    return this.denylistModel;
  }

  private static getDeviceModel(): DeviceModel {
    if (!this.deviceModel) {
      this.deviceModel = new DeviceModel();
    }
    return this.deviceModel;
  }

  static toSyncEntry(entry: DeviceDenylistEntry): DenylistSyncEntry {
    const exp = entry.expires_at
      ? Math.floor(new Date(entry.expires_at).getTime() / 1000)
      : PERMANENT_DENYLIST_EXP;
    return { sub: entry.user_id, exp };
  }

  static async getDenylistsForDeviceIds(
    deviceIds: string[],
  ): Promise<Map<string, DenylistSyncEntry[]>> {
    const uniqueIds = [...new Set(deviceIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const entries = await this.getDenylistModel().findActiveByDeviceIds(uniqueIds);
    const grouped = new Map<string, DenylistSyncEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.device_id) ?? [];
      list.push(this.toSyncEntry(entry));
      grouped.set(entry.device_id, list);
    }
    return grouped;
  }

  static async buildOperationalSyncForGateway(
    gatewayId: string,
  ): Promise<OperationalDeviceDenylistSync[]> {
    const [locks, accessControls] = await Promise.all([
      this.getDeviceModel().findBluLokDevices({ gateway_id: gatewayId }),
      this.getDeviceModel().findAccessControlDevices({ gateway_id: gatewayId }),
    ]);

    const rows: Array<{ cloud_device_id: string; kind: 'lock' | 'access_control'; serial: string; relay_channel?: number | null }> = [
      ...locks.map((lock) => ({
        cloud_device_id: lock.id,
        kind: 'lock' as const,
        serial: lock.device_serial,
      })),
      ...accessControls.map((device) => ({
        cloud_device_id: device.id,
        kind: 'access_control' as const,
        serial: device.device_serial,
        relay_channel: device.relay_channel,
      })),
    ];

    const denylistByDevice = await this.getDenylistsForDeviceIds(rows.map((row) => row.cloud_device_id));

    return rows.map((row) => ({
      ...row,
      denylist: denylistByDevice.get(row.cloud_device_id) ?? [],
    }));
  }
}
