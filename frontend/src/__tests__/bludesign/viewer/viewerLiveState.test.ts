import { DeviceState } from '@/components/bludesign/core/types';
import {
  resolveDeviceStateFromTelemetry,
  resolveAccessControlDeviceState,
  snapshotToViewerStates,
} from '@/components/bludesign/viewer/viewerLiveState';

describe('viewerLiveState', () => {
  describe('resolveDeviceStateFromTelemetry', () => {
    it('maps offline device_status', () => {
      expect(resolveDeviceStateFromTelemetry('locked', 'offline')).toBe(DeviceState.OFFLINE);
    });

    it('maps error states', () => {
      expect(resolveDeviceStateFromTelemetry('error', 'online')).toBe(DeviceState.ERROR);
      expect(resolveDeviceStateFromTelemetry('locked', 'error')).toBe(DeviceState.ERROR);
    });

    it('maps maintenance', () => {
      expect(resolveDeviceStateFromTelemetry('maintenance', 'online')).toBe(DeviceState.MAINTENANCE);
    });

    it('maps lock positions', () => {
      expect(resolveDeviceStateFromTelemetry('unlocked', 'online')).toBe(DeviceState.UNLOCKED);
      expect(resolveDeviceStateFromTelemetry('locked', 'online')).toBe(DeviceState.LOCKED);
      expect(resolveDeviceStateFromTelemetry('locking', 'online')).toBe(DeviceState.LOCKED);
    });
  });

  describe('resolveAccessControlDeviceState', () => {
    it('maps gate/elevator/door telemetry', () => {
      expect(resolveAccessControlDeviceState('offline', true)).toBe(DeviceState.OFFLINE);
      expect(resolveAccessControlDeviceState('error', false)).toBe(DeviceState.ERROR);
      expect(resolveAccessControlDeviceState('online', true)).toBe(DeviceState.LOCKED);
      expect(resolveAccessControlDeviceState('online', false)).toBe(DeviceState.UNLOCKED);
    });
  });

  describe('snapshotToViewerStates', () => {
    it('indexes both unit and device ids for bindings', () => {
      const states = snapshotToViewerStates({
        unit_id: 'unit-1',
        device_id: 'dev-1',
        lock_status: 'unlocked',
        device_status: 'online',
      });
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.entityId).sort()).toEqual(['dev-1', 'unit-1']);
      expect(states[0].state).toBe(DeviceState.UNLOCKED);
    });
  });
});
