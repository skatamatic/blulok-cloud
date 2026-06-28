import type { DeviceStateUpdate, FriendNodeInventoryItem } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';
import type { IDeviceModel } from '../IDeviceModel';
import { FriendNodeDevice as FriendNodeDeviceClass } from './FriendNodeDevice';

export class FriendNodeDevice implements IDeviceModel {
  constructor(private data: FriendNodeInventoryItem) {}

  get id(): string {
    return this.data.serial;
  }

  get kind(): 'friend_node' {
    return 'friend_node';
  }

  toInventoryItem(): FriendNodeInventoryItem {
    return { ...this.data, last_seen: new Date().toISOString() };
  }

  toInventorySyncItem(): FriendNodeInventoryItem {
    return this.toInventoryItem();
  }

  toStateUpdate(): DeviceStateUpdate {
    return {
      kind: 'friend_node',
      serial: this.data.serial,
      state: this.data.state,
      firmware_version: this.data.firmware_version,
      online: this.data.online,
      info: this.data.info,
      last_seen: new Date().toISOString(),
    };
  }

  applyCommand(_payload: JwtCommandPayload): boolean {
    return false;
  }

  applyFirmware(version: string): void {
    this.data.firmware_version = version;
  }

  clone(): IDeviceModel {
    return new FriendNodeDeviceClass({ ...this.data });
  }
}
