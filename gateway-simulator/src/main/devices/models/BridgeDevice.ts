import type { BridgeInventoryItem, DeviceStateUpdate } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';
import type { IDeviceModel } from '../IDeviceModel';
import { BridgeDevice as BridgeDeviceClass } from './BridgeDevice';

export class BridgeDevice implements IDeviceModel {
  constructor(private data: BridgeInventoryItem) {}

  get id(): string {
    return this.data.serial;
  }

  get kind(): 'bridge' {
    return 'bridge';
  }

  toInventoryItem(): BridgeInventoryItem {
    return { ...this.data, last_seen: new Date().toISOString() };
  }

  toInventorySyncItem(): BridgeInventoryItem {
    return this.toInventoryItem();
  }

  toStateUpdate(): DeviceStateUpdate {
    return {
      kind: 'bridge',
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
    return new BridgeDeviceClass({ ...this.data });
  }
}
