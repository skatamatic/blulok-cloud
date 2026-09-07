import type { AccessControlInventoryItem, DeviceStateUpdate } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';
import type { IDeviceModel } from '../IDeviceModel';
import { AccessControlDevice as AccessControlDeviceClass } from './AccessControlDevice';

export class AccessControlDevice implements IDeviceModel {
  constructor(private data: AccessControlInventoryItem) {}

  get id(): string {
    return this.data.access_id;
  }

  get kind(): 'access_control' {
    return 'access_control';
  }

  toInventoryItem(): AccessControlInventoryItem {
    return { ...this.data, last_seen: new Date().toISOString() };
  }

  /** Cloud inventory sync rejects simulator-only fields (firmware, errors, cloud ids). */
  toInventorySyncItem(): AccessControlInventoryItem {
    const item = this.toInventoryItem();
    return {
      kind: 'access_control',
      access_id: item.access_id,
      relay_channel: item.relay_channel ?? 1,
      device_type: item.device_type,
      name: item.name,
      location_description: item.location_description,
      online: item.online,
      locked: item.locked,
      last_seen: item.last_seen,
    };
  }

  /** Cloud `/devices/state` accepts only telemetry fields — not full inventory rows. */
  toStateUpdate(): DeviceStateUpdate {
    return {
      kind: 'access_control',
      access_id: this.data.access_id,
      relay_channel: this.data.relay_channel ?? 1,
      online: this.data.online,
      locked: this.data.locked,
      last_seen: new Date().toISOString(),
    };
  }

  applyCommand(payload: JwtCommandPayload): boolean {
    if (payload.cmd_type === 'LOCK') {
      this.data.locked = true;
      return true;
    }
    if (payload.cmd_type === 'UNLOCK') {
      this.data.locked = false;
      return true;
    }
    return false;
  }

  applyFirmware(version: string): void {
    this.data.firmware_version = version;
  }

  clone(): IDeviceModel {
    return new AccessControlDeviceClass({ ...this.data });
  }
}
