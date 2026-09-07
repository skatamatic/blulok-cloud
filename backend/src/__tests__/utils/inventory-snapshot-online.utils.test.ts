import {
  snapshotOnlineFromAccessControlStatus,
  snapshotOnlineFromBluLokDeviceStatus,
  snapshotOnlineFromInfraState,
} from '@/utils/inventory-snapshot-online.utils';

describe('inventory-snapshot-online.utils', () => {
  it('maps BluLok device_status to online', () => {
    expect(snapshotOnlineFromBluLokDeviceStatus('online')).toBe(true);
    expect(snapshotOnlineFromBluLokDeviceStatus('low_battery')).toBe(true);
    expect(snapshotOnlineFromBluLokDeviceStatus('offline')).toBe(false);
    expect(snapshotOnlineFromBluLokDeviceStatus('error')).toBe(false);
  });

  it('maps access control status to online', () => {
    expect(snapshotOnlineFromAccessControlStatus('online')).toBe(true);
    expect(snapshotOnlineFromAccessControlStatus('offline')).toBe(false);
  });

  it('maps infra state to online', () => {
    expect(snapshotOnlineFromInfraState('healthy')).toBe(true);
    expect(snapshotOnlineFromInfraState('OK')).toBe(true);
    expect(snapshotOnlineFromInfraState('error')).toBe(false);
  });
});
