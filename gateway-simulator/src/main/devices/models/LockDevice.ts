import type { DeviceStateUpdate, LockInventoryItem, LockState } from '@protocol/device-kinds';
import type { JwtCommandPayload } from '@protocol/commands';
import type { IDeviceModel } from '../IDeviceModel';
import { LockDevice as LockDeviceClass } from './LockDevice';

export class LockDevice implements IDeviceModel {
  constructor(private data: LockInventoryItem) {}

  get id(): string {
    return this.data.lock_id;
  }

  get kind(): 'lock' {
    return 'lock';
  }

  toInventoryItem(): LockInventoryItem {
    return { ...this.data, last_seen: new Date().toISOString() };
  }

  toInventorySyncItem(): LockInventoryItem {
    const item = this.toInventoryItem();
    const {
      cloud_device_id: _cloudDeviceId,
      error_code: _errorCode,
      error_message: _errorMessage,
      ...syncItem
    } = item;
    return syncItem;
  }

  toStateUpdate(): DeviceStateUpdate {
    return {
      kind: 'lock',
      lock_id: this.data.lock_id,
      lock_number: this.data.lock_number,
      state: this.data.state,
      locked: this.data.locked,
      battery_level: this.data.battery_level,
      battery_unit: this.data.battery_unit,
      online: this.data.online,
      signal_strength: this.data.signal_strength,
      temperature_value: this.data.temperature_value,
      temperature_unit: this.data.temperature_unit,
      firmware_version: this.data.firmware_version,
      error_code: this.data.error_code,
      error_message: this.data.error_message,
      last_seen: new Date().toISOString(),
    };
  }

  applyCommand(payload: JwtCommandPayload): boolean {
    if (payload.cmd_type === 'LOCK') {
      this.data.locked = true;
      this.data.state = 'CLOSED';
      return true;
    }
    if (payload.cmd_type === 'UNLOCK') {
      this.data.locked = false;
      this.data.state = 'OPENED';
      return true;
    }
    return false;
  }

  applyFirmware(version: string): void {
    this.data.firmware_version = version;
  }

  clone(): IDeviceModel {
    return new LockDeviceClass({ ...this.data });
  }

  setState(state: LockState, locked?: boolean): void {
    this.data.state = state;
    if (locked !== undefined) this.data.locked = locked;
  }
}
