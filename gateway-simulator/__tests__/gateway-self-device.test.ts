import { describe, expect, it } from 'vitest';
import { GatewaySelfDevice } from '../src/main/devices/models/GatewaySelfDevice';

describe('GatewaySelfDevice', () => {
  const base = {
    kind: 'gateway' as const,
    serial: 'SN-GW-1',
    firmware_version: '1.2.3',
    mac_address: 'AA:BB:CC:DD:EE:FF',
  };

  it('exposes id, kind, and inventory sync payloads', () => {
    const device = new GatewaySelfDevice({ ...base });
    expect(device.id).toBe('SN-GW-1');
    expect(device.kind).toBe('gateway');
    const item = device.toInventoryItem();
    expect(item.serial).toBe('SN-GW-1');
    expect(item.last_seen).toBeTruthy();
    expect(device.toInventorySyncItem()).toMatchObject({ serial: 'SN-GW-1', kind: 'gateway' });
    expect(device.toStateUpdate()).toMatchObject({ serial: 'SN-GW-1', kind: 'gateway' });
  });

  it('ignores commands and applies firmware updates', () => {
    const device = new GatewaySelfDevice({ ...base });
    expect(device.applyCommand({ cmd_type: 'LOCK' } as never)).toBe(false);
    device.applyFirmware('9.9.9');
    expect(device.toInventoryItem().firmware_version).toBe('9.9.9');
  });

  it('clone produces independent copy', () => {
    const device = new GatewaySelfDevice({ ...base });
    const cloned = device.clone();
    device.applyFirmware('2.0.0');
    expect(cloned.toInventoryItem().firmware_version).toBe('1.2.3');
  });
});
