import type { LockUnlockPayload } from '@protocol/commands';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import type { IDeviceModel } from '../devices/IDeviceModel';
import { deviceKey } from '../devices/IDeviceModel';

export function normalizeCommandDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

export function deviceMatchesCommandId(item: DeviceInventoryItem, deviceId: string): boolean {
  const needle = normalizeCommandDeviceId(deviceId);
  if (!needle) return false;

  switch (item.kind) {
    case 'lock':
      return (
        normalizeCommandDeviceId(item.lock_id) === needle
        || normalizeCommandDeviceId(deviceKey(item)) === needle
        || (item.cloud_device_id != null && normalizeCommandDeviceId(item.cloud_device_id) === needle)
      );
    case 'access_control':
      return (
        normalizeCommandDeviceId(item.access_id) === needle
        || (item.cloud_device_id != null && normalizeCommandDeviceId(item.cloud_device_id) === needle)
      );
    case 'bridge':
    case 'friend_node':
    case 'gateway':
      return normalizeCommandDeviceId(item.serial) === needle;
    default:
      return false;
  }
}

export function findDeviceForCommand(
  devices: Iterable<IDeviceModel>,
  deviceId: string,
): IDeviceModel | undefined {
  for (const device of devices) {
    if (deviceMatchesCommandId(device.toInventoryItem(), deviceId)) {
      return device;
    }
  }
  return undefined;
}

/** Returns true when the command JWT expires_at is in the past (0 = one-shot, never expired). */
export function isLockCommandExpired(payload: LockUnlockPayload, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const exp = payload.expires_at;
  if (exp === undefined || exp === null) return false;
  if (exp === 0) return false;
  return exp < nowSec;
}
