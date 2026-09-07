import type { GatewaySelfInventoryItem } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';
import type { IDeviceModel } from '../IDeviceModel';
import { GatewaySelfDevice as GatewaySelfDeviceClass } from './GatewaySelfDevice';

export class GatewaySelfDevice implements IDeviceModel {
  constructor(private data: GatewaySelfInventoryItem) {}

  get id(): string {
    return this.data.serial;
  }

  get kind(): 'gateway' {
    return 'gateway';
  }

  toInventoryItem(): GatewaySelfInventoryItem {
    return { ...this.data, last_seen: new Date().toISOString() };
  }

  toInventorySyncItem(): GatewaySelfInventoryItem {
    return this.toInventoryItem();
  }

  toStateUpdate(): GatewaySelfInventoryItem {
    return this.toInventoryItem();
  }

  applyCommand(_payload: JwtCommandPayload): boolean {
    return false;
  }

  applyFirmware(version: string): void {
    this.data.firmware_version = version;
  }

  clone(): IDeviceModel {
    return new GatewaySelfDeviceClass({ ...this.data });
  }
}
