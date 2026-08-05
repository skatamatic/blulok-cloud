/**
 * @jest-environment jsdom
 */
import {
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  CloudIcon,
} from '@heroicons/react/24/outline';
import { AccessLog } from '@/types/access-history.types';
import {
  getAccessHistoryActionIcon,
  getAccessHistoryMethodIcon,
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
  });
});
