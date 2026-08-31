/**
 * @jest-environment jsdom
 */
import {
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  CloudIcon,
  DevicePhoneMobileIcon,
  CalculatorIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { AccessLog } from '@/types/access-history.types';
import {
  getAccessHistoryActionIcon,
  getAccessHistoryMethodIcon,
  getAccessSessionActionIcon,
} from '@/components/AccessHistory/accessHistoryIcons';

describe('accessHistoryIcons', () => {
  const baseLog: AccessLog = {
    id: 'log-1',
    device_id: 'dev-1',
    device_type: 'blulok',
    action: 'unlock',
    method: 'app',
    success: true,
    occurred_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  };

  describe('getAccessHistoryActionIcon', () => {
    it('returns LockClosedIcon for manual lock events', () => {
      const manualLock: AccessLog = {
        ...baseLog,
        action: 'lock',
        method: 'local_device',
        user_id: undefined,
        metadata: {},
      };
      expect(getAccessHistoryActionIcon(manualLock)).toBe(LockClosedIcon);
    });

    it('returns LockOpenIcon for correlated remote unlock', () => {
      const correlatedUnlock: AccessLog = {
        ...baseLog,
        action: 'unlock',
        method: 'local_device',
        metadata: {
          correlated_remote: true,
        },
      };
      expect(getAccessHistoryActionIcon(correlatedUnlock)).toBe(LockOpenIcon);
    });

    it('returns CheckCircleIcon for remote_access_granted', () => {
      const remoteAccess: AccessLog = {
        ...baseLog,
        action: 'remote_access_granted',
        method: 'admin_remote',
      };
      expect(getAccessHistoryActionIcon(remoteAccess)).toBe(CheckCircleIcon);
    });

    it('returns LockOpenIcon for occupied unit override unlock', () => {
      const overrideUnlock: AccessLog = {
        ...baseLog,
        action: 'unlock',
        method: 'admin_remote',
        metadata: {
          occupied_unit_override: true,
        },
      };
      expect(getAccessHistoryActionIcon(overrideUnlock)).toBe(LockOpenIcon);
    });
  });

  describe('getAccessHistoryMethodIcon', () => {
    it('returns CloudIcon for admin_remote method', () => {
      const adminRemote: AccessLog = {
        ...baseLog,
        method: 'admin_remote',
      };
      expect(getAccessHistoryMethodIcon(adminRemote)).toBe(CloudIcon);
    });

    it('returns CloudIcon for remote_gateway method', () => {
      const remoteGateway: AccessLog = {
        ...baseLog,
        method: 'remote_gateway',
      };
      expect(getAccessHistoryMethodIcon(remoteGateway)).toBe(CloudIcon);
    });

    it('returns LockClosedIcon for manual lock events', () => {
      const manualLock: AccessLog = {
        ...baseLog,
        action: 'lock',
        method: 'local_device',
        user_id: undefined,
        metadata: {},
      };
      expect(getAccessHistoryMethodIcon(manualLock)).toBe(LockClosedIcon);
    });

    it('returns LockOpenIcon for correlated remote unlock', () => {
      const correlatedUnlock: AccessLog = {
        ...baseLog,
        action: 'unlock',
        method: 'local_device',
        metadata: {
          correlated_remote: true,
        },
      };
      expect(getAccessHistoryMethodIcon(correlatedUnlock)).toBe(LockOpenIcon);
    });

    it('returns CalculatorIcon for keypad and DevicePhoneMobileIcon for app', () => {
      expect(getAccessHistoryMethodIcon({ ...baseLog, method: 'keypad' })).toBe(CalculatorIcon);
      expect(getAccessHistoryMethodIcon({ ...baseLog, method: 'app' })).toBe(DevicePhoneMobileIcon);
      expect(getAccessHistoryMethodIcon({ ...baseLog, method: 'mobile_key' })).toBe(
        DevicePhoneMobileIcon,
      );
    });
  });

  describe('getAccessSessionActionIcon', () => {
    it('uses phone for mobile key and calculator for keypad', () => {
      expect(
        getAccessSessionActionIcon({ state: 'closed', method: 'app', origin: 'on_site' }),
      ).toBe(DevicePhoneMobileIcon);
      expect(
        getAccessSessionActionIcon({ state: 'closed', method: 'keypad', origin: 'on_site' }),
      ).toBe(CalculatorIcon);
    });

    it('uses cloud for remote unlock and clock while pending', () => {
      expect(
        getAccessSessionActionIcon({
          state: 'closed',
          method: 'admin_remote',
          origin: 'cloud_remote',
        }),
      ).toBe(CloudIcon);
      expect(
        getAccessSessionActionIcon({
          state: 'pending',
          method: 'admin_remote',
          origin: 'cloud_remote',
        }),
      ).toBe(ClockIcon);
    });
  });
});
