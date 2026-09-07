import type { DeviceInventoryItem, DeviceStateUpdate, GatewayInventoryKind } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';

export interface IDeviceModel {
  readonly id: string;
  readonly kind: GatewayInventoryKind;
  toInventoryItem(): DeviceInventoryItem;
  /** Cloud `/devices/inventory` payload — omit simulator-only fields. */
  toInventorySyncItem(): DeviceInventoryItem;
  toStateUpdate(): DeviceStateUpdate;
  applyCommand(payload: JwtCommandPayload): boolean;
  applyFirmware(version: string): void;
  clone(): IDeviceModel;
}

export function deviceKey(item: DeviceInventoryItem): string {
  switch (item.kind) {
    case 'lock':
      return `lock:${item.lock_id}`;
    case 'access_control':
      return `access_control:${item.access_id}:${item.relay_channel ?? 1}`;
    case 'bridge':
    case 'friend_node':
    case 'gateway':
      return `${item.kind}:${item.serial}`;
    default:
      return JSON.stringify(item);
  }
}
