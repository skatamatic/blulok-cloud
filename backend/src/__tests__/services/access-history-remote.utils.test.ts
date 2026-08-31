import { UserRole } from '@/types/auth.types';
import {
  resolveRemoteAccessMethod,
  terminalActivityMatchesRequestedStatus,
  mapLegacyAccessAction,
  mapLegacyAccessMethod,
} from '@/utils/access-history-remote.utils';

describe('access-history-remote.utils', () => {
  describe('resolveRemoteAccessMethod', () => {
    it('maps platform and facility admins to admin_remote', () => {
      expect(resolveRemoteAccessMethod(UserRole.ADMIN)).toBe('admin_remote');
      expect(resolveRemoteAccessMethod(UserRole.DEV_ADMIN)).toBe('admin_remote');
      expect(resolveRemoteAccessMethod(UserRole.FACILITY_ADMIN)).toBe('admin_remote');
    });

    it('maps other roles to remote_gateway', () => {
      expect(resolveRemoteAccessMethod(UserRole.TENANT)).toBe('remote_gateway');
      expect(resolveRemoteAccessMethod(UserRole.MAINTENANCE)).toBe('remote_gateway');
    });
  });

  describe('terminalActivityMatchesRequestedStatus', () => {
    it('matches unlock request only to unlock activity', () => {
      expect(terminalActivityMatchesRequestedStatus('unlock', 'unlocked')).toBe(true);
      expect(terminalActivityMatchesRequestedStatus('lock', 'unlocked')).toBe(false);
    });

    it('matches lock request only to lock activity', () => {
      expect(terminalActivityMatchesRequestedStatus('lock', 'locked')).toBe(true);
      expect(terminalActivityMatchesRequestedStatus('unlock', 'locked')).toBe(false);
    });
  });

  describe('mapLegacyAccessAction', () => {
    it('maps legacy denials and keypad failures to unlock_attempt', () => {
      expect(mapLegacyAccessAction('access_denied', false)).toBe('unlock_attempt');
      expect(mapLegacyAccessAction('keypad_attempt', false)).toBe('unlock_attempt');
    });

    it('preserves attempt actions and defaults by success', () => {
      expect(mapLegacyAccessAction('lock_attempt', false)).toBe('lock_attempt');
      expect(mapLegacyAccessAction(undefined, true)).toBe('access_granted');
      expect(mapLegacyAccessAction(undefined, false)).toBe('unlock_attempt');
    });
  });

  describe('mapLegacyAccessMethod', () => {
    it('normalizes automatic and empty methods to local_device', () => {
      expect(mapLegacyAccessMethod('automatic')).toBe('local_device');
      expect(mapLegacyAccessMethod(undefined)).toBe('local_device');
      expect(mapLegacyAccessMethod('')).toBe('local_device');
    });

    it('passes through other methods unchanged', () => {
      expect(mapLegacyAccessMethod('admin_remote')).toBe('admin_remote');
      expect(mapLegacyAccessMethod('keypad')).toBe('keypad');
    });
  });
});
