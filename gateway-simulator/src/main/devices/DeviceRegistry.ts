import type {

  AccessControlInventoryItem,

  BridgeInventoryItem,

  DeviceInventoryItem,

  FriendNodeInventoryItem,

  GatewaySelfInventoryItem,

  LockInventoryItem,

} from '@protocol/device-kinds';

import { assertAddableInventoryKind, filterManagedInventoryDevices } from '@protocol/device-kinds';

import type { DeviceSimulatorState, SimulatedDeviceRecord } from '@protocol/device-simulator-state';

import { deviceKey, type IDeviceModel } from './IDeviceModel';

import { findDeviceForCommand } from '../commands/lock-unlock.utils';

import {

  cloneSimState,

  createDefaultDeviceSimState,

} from './device-simulator.utils';

import {
  type CloudDenylistEntry,
  applyOperationalDenylistSync,
  replaceSimDenylist,
  type OperationalDeviceDenylistSync,
} from './denylist-sync.utils';

import { LockDevice } from './models/LockDevice';

import { AccessControlDevice } from './models/AccessControlDevice';

import { BridgeDevice } from './models/BridgeDevice';

import { FriendNodeDevice } from './models/FriendNodeDevice';

import { GatewaySelfDevice } from './models/GatewaySelfDevice';



export type CreateDeviceContext = {

  facilityId: string;

  operationsKeyPublicB64?: string;

};



export class DeviceFactory {

  static create(item: DeviceInventoryItem): IDeviceModel {

    switch (item.kind) {

      case 'lock':

        return new LockDevice(item);

      case 'access_control':

        return new AccessControlDevice(item);

      case 'bridge':

        return new BridgeDevice(item);

      case 'friend_node':

        return new FriendNodeDevice(item);

      case 'gateway':

        return new GatewaySelfDevice(item);

      default:

        throw new Error(`Unknown device kind: ${(item as DeviceInventoryItem).kind}`);

    }

  }



  static createDefault(
    kind: DeviceInventoryItem['kind'],
    idSuffix: string,
    ctx?: CreateDeviceContext,
  ): SimulatedDeviceRecord {
    const resolvedCtx: CreateDeviceContext = ctx ?? { facilityId: 'sim-facility' };
    assertAddableInventoryKind(kind);

    const now = new Date().toISOString();

    let item: DeviceInventoryItem;

    switch (kind) {

      case 'lock':

        item = {

          kind: 'lock',

          lock_id: `SIM-LOCK-${idSuffix}`,

          lock_number: 1,

          state: 'CLOSED',

          locked: true,

          battery_level: 3400,

          battery_unit: 'mV',

          firmware_version: '1.0.0',

          online: true,

          signal_strength: -55,

          last_seen: now,

        } satisfies LockInventoryItem;

        break;

      case 'access_control':

        item = {

          kind: 'access_control',

          access_id: `SIM-AC-${idSuffix}`,

          relay_channel: 1,

          device_type: 'gate',

          locked: true,

          firmware_version: '1.0.0',

          online: true,

          last_seen: now,

        } satisfies AccessControlInventoryItem;

        break;

      case 'bridge':

        item = {

          kind: 'bridge',

          serial: `SIM-BR-${idSuffix}`,

          state: 'healthy',

          firmware_version: '1.0.0',

          online: true,

          last_seen: now,

        } satisfies BridgeInventoryItem;

        break;

      case 'friend_node':

        item = {

          kind: 'friend_node',

          serial: `SIM-FN-${idSuffix}`,

          state: 'healthy',

          firmware_version: '1.0.0',

          online: true,

          last_seen: now,

        } satisfies FriendNodeInventoryItem;

        break;

      default:

        throw new Error(`Unknown kind: ${kind}`);

    }

    return {

      item,

      sim: createDefaultDeviceSimState(resolvedCtx.facilityId, kind, resolvedCtx.operationsKeyPublicB64),
    };
  }

  static createDefaultModel(
    kind: DeviceInventoryItem['kind'],
    idSuffix: string,
    ctx?: CreateDeviceContext,
  ): IDeviceModel {
    return DeviceFactory.create(DeviceFactory.createDefault(kind, idSuffix, ctx).item);
  }

  static createDefaultInventoryItem(kind: DeviceInventoryItem['kind'], idSuffix: string): DeviceInventoryItem {
    return DeviceFactory.createDefault(kind, idSuffix).item;
  }
}



export class DeviceRegistry {

  private devices = new Map<string, IDeviceModel>();

  private simStates = new Map<string, DeviceSimulatorState>();

  private createCtx: CreateDeviceContext = { facilityId: '' };



  setCreateContext(ctx: CreateDeviceContext): void {

    this.createCtx = ctx;

  }



  load(records: SimulatedDeviceRecord[]): void {

    this.devices.clear();

    this.simStates.clear();

    for (const record of filterManagedInventoryRecords(records)) {

      this.setRecord(record);

    }

  }



  /** Replace managed inventory from a cloud recovery snapshot, preserving sim state for retained devices. */
  loadInventorySnapshot(
    items: DeviceInventoryItem[],
    denylistByKey?: Map<string, CloudDenylistEntry[]>,
  ): void {
    const existingByKey = new Map(
      [...this.iterRecords()].map(([key, record]) => [key, record] as const),
    );
    const records: SimulatedDeviceRecord[] = items.map((item) => {
      const key = deviceKey(item);
      const existing = existingByKey.get(key);
      const cloudDenylist = denylistByKey?.get(key);
      const sim = existing
        ? cloneSimState(existing.sim)
        : createDefaultDeviceSimState(
            this.createCtx.facilityId || 'sim-facility',
            item.kind,
            this.createCtx.operationsKeyPublicB64,
          );
      if (cloudDenylist !== undefined) {
        replaceSimDenylist(sim, cloudDenylist);
      }
      return { item, sim };
    });
    this.load(records);
  }

  /** Apply cloud denylist state from inventory sync response rows. */
  applyOperationalDenylistSync(rows: OperationalDeviceDenylistSync[]): number {
    return applyOperationalDenylistSync(this, rows);
  }

  /** @deprecated Use loadInventorySnapshot — accepts legacy inventory-only arrays. */
  loadInventory(items: DeviceInventoryItem[]): void {

    this.load(items.map((item) => ({

      item,

      sim: createDefaultDeviceSimState(
        this.createCtx.facilityId || 'sim-facility',
        item.kind,
        this.createCtx.operationsKeyPublicB64,
      ),

    })));

  }



  exportRecords(): SimulatedDeviceRecord[] {

    return [...this.devices.entries()].map(([key, device]) => ({

      item: device.toInventoryItem(),

      sim: cloneSimState(this.requireSim(key)),

    }));

  }



  list(): DeviceInventoryItem[] {

    return [...this.devices.values()].map((d) => d.toInventoryItem());

  }



  get(key: string): IDeviceModel | undefined {

    return this.devices.get(key);

  }



  getSimState(key: string): DeviceSimulatorState | undefined {

    const sim = this.simStates.get(key);

    return sim ? cloneSimState(sim) : undefined;

  }



  getRecord(key: string): SimulatedDeviceRecord | undefined {

    const device = this.devices.get(key);

    const sim = this.simStates.get(key);

    if (!device || !sim) return undefined;

    return { item: device.toInventoryItem(), sim: cloneSimState(sim) };

  }



  add(model: IDeviceModel): void {
    const item = model.toInventoryItem();
    const key = deviceKey(item);
    this.devices.set(key, model);
    if (!this.simStates.has(key)) {
      this.simStates.set(
        key,
        createDefaultDeviceSimState(
          this.createCtx.facilityId || 'sim-facility',
          item.kind,
          this.createCtx.operationsKeyPublicB64,
        ),
      );
    }
  }

  addRecord(record: SimulatedDeviceRecord): void {

    this.setRecord(record);

  }



  addDefault(kind: DeviceInventoryItem['kind'], idSuffix: string): SimulatedDeviceRecord {

    const record = DeviceFactory.createDefault(kind, idSuffix, this.createCtx);

    this.setRecord(record);

    return record;

  }



  update(key: string, patch: Partial<DeviceInventoryItem>): IDeviceModel | undefined {

    const existing = this.devices.get(key);

    if (!existing) return undefined;

    const merged = { ...existing.toInventoryItem(), ...patch } as DeviceInventoryItem;

    const model = DeviceFactory.create(merged);

    this.devices.set(key, model);

    return model;

  }



  updateSimState(key: string, mutate: (sim: DeviceSimulatorState) => void): DeviceSimulatorState | undefined {

    const sim = this.simStates.get(key);

    if (!sim) return undefined;

    mutate(sim);

    return cloneSimState(sim);

  }



  replaceRecord(key: string, record: SimulatedDeviceRecord): void {

    const nextKey = deviceKey(record.item);

    if (nextKey !== key) {

      this.devices.delete(key);

      this.simStates.delete(key);

    }

    this.setRecord(record);

  }



  remove(key: string): boolean {

    const ok = this.devices.delete(key);

    this.simStates.delete(key);

    return ok;

  }



  clear(): void {

    this.devices.clear();

    this.simStates.clear();

  }



  applyCommandToDevice(deviceId: string, payload: import('@protocol/commands').JwtCommandPayload): boolean {

    const device = findDeviceForCommand(this.devices.values(), deviceId);

    if (!device) return false;

    return device.applyCommand(payload);

  }



  iterDevices(): IterableIterator<IDeviceModel> {

    return this.devices.values();

  }



  iterRecords(): IterableIterator<[string, SimulatedDeviceRecord]> {

    return (function* registryRecords(this: DeviceRegistry) {

      for (const [key, device] of this.devices) {

        const sim = this.simStates.get(key);

        if (!sim) continue;

        yield [key, { item: device.toInventoryItem(), sim: cloneSimState(sim) }] as [string, SimulatedDeviceRecord];

      }

    }).call(this);

  }



  forEachSimState(fn: (key: string, sim: DeviceSimulatorState, device: IDeviceModel) => void): void {

    for (const [key, device] of this.devices) {

      const sim = this.simStates.get(key);

      if (sim) fn(key, sim, device);

    }

  }



  updateGatewaySelfSerial(serial: string): boolean {

    for (const [key, device] of this.devices) {

      const item = device.toInventoryItem();

      if (item.kind === 'gateway') {

        this.update(key, { serial });

        return true;

      }

    }

    return false;

  }



  applyFirmware(targetType: string, version: string, deviceId?: string): void {

    for (const device of this.devices.values()) {

      const item = device.toInventoryItem();

      if (targetType === 'gateway' && item.kind === 'gateway') {

        device.applyFirmware(version);

      } else if (targetType === 'lock' && item.kind === 'lock') {

        if (!deviceId || item.lock_id === deviceId) device.applyFirmware(version);

      } else if (targetType === 'access_control' && item.kind === 'access_control') {

        if (!deviceId || item.access_id === deviceId) device.applyFirmware(version);

      } else if (targetType === 'friend_node' && item.kind === 'friend_node') {

        if (!deviceId || item.serial === deviceId) device.applyFirmware(version);

      } else if (targetType === 'bridge' && item.kind === 'bridge') {

        if (!deviceId || item.serial === deviceId) device.applyFirmware(version);

      }

    }

  }



  stateUpdates(): import('@protocol/device-kinds').DeviceStateUpdate[] {

    return filterManagedInventoryDevices(
      [...this.devices.values()].map((d) => d.toStateUpdate() as DeviceInventoryItem),
    ) as import('@protocol/device-kinds').DeviceStateUpdate[];

  }



  inventorySyncItems(): DeviceInventoryItem[] {

    return filterManagedInventoryDevices(
      [...this.devices.values()].map((d) => d.toInventorySyncItem()),
    );

  }



  private setRecord(record: SimulatedDeviceRecord): void {

    const key = deviceKey(record.item);

    this.devices.set(key, DeviceFactory.create(record.item));

    this.simStates.set(key, cloneSimState(record.sim));

  }



  private requireSim(key: string): DeviceSimulatorState {

    const sim = this.simStates.get(key);

    if (!sim) throw new Error(`Missing simulator state for device ${key}`);

    return sim;

  }

}



function filterManagedInventoryRecords(records: SimulatedDeviceRecord[]): SimulatedDeviceRecord[] {

  return records.filter((record) => record.item.kind !== 'gateway');

}


