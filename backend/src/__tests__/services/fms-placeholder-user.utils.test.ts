import {
  buildFmsPlaceholderLoginIdentifier,
  buildPlaceholderUpgradeUpdates,
  isFmsPlaceholderLoginIdentifier,
  isPlaceholderUser,
  FMS_PLACEHOLDER_LOGIN_PREFIX,
} from '@/services/fms/fms-placeholder-user.utils';

describe('fms-placeholder-user.utils', () => {
  describe('buildFmsPlaceholderLoginIdentifier', () => {
    it('builds a reserved facility-scoped identifier', () => {
      expect(buildFmsPlaceholderLoginIdentifier('Fac-1', 'Ext-99')).toBe(
        `${FMS_PLACEHOLDER_LOGIN_PREFIX}${encodeURIComponent('fac-1')}:${encodeURIComponent('ext-99')}`,
      );
    });

    it('encodes special characters so distinct ids do not collide', () => {
      expect(buildFmsPlaceholderLoginIdentifier('fac', 'foo@1')).not.toBe(
        buildFmsPlaceholderLoginIdentifier('fac', 'foo1'),
      );
    });

    it('rejects missing facility or external id', () => {
      expect(() => buildFmsPlaceholderLoginIdentifier('', 'x')).toThrow(/required/);
      expect(() => buildFmsPlaceholderLoginIdentifier('f', '')).toThrow(/required/);
    });
  });

  describe('isFmsPlaceholderLoginIdentifier / isPlaceholderUser', () => {
    it('detects reserved login identifiers', () => {
      expect(isFmsPlaceholderLoginIdentifier('fms-ph:a:b')).toBe(true);
      expect(isFmsPlaceholderLoginIdentifier('user@test.com')).toBe(false);
    });

    it('detects placeholder flag or reserved login', () => {
      expect(isPlaceholderUser({ is_placeholder: true })).toBe(true);
      expect(isPlaceholderUser({ is_placeholder: 1 })).toBe(true);
      expect(isPlaceholderUser({ login_identifier: 'fms-ph:fac:ext' })).toBe(true);
      expect(isPlaceholderUser({ email: 'a@b.com', is_placeholder: false })).toBe(false);
    });
  });

  describe('buildPlaceholderUpgradeUpdates', () => {
    it('returns null when neither email nor phone is provided', () => {
      expect(buildPlaceholderUpgradeUpdates({})).toBeNull();
      expect(buildPlaceholderUpgradeUpdates({ email: '  ', phoneE164: '' })).toBeNull();
    });

    it('prefers email as login_identifier and clears placeholder flag', () => {
      expect(
        buildPlaceholderUpgradeUpdates({
          email: 'User@Test.com',
          phoneE164: '+15551234567',
        }),
      ).toEqual({
        email: 'user@test.com',
        phone_number: '+15551234567',
        login_identifier: 'user@test.com',
        is_placeholder: false,
        requires_password_reset: true,
      });
    });

    it('uses phone as login when email is absent', () => {
      expect(buildPlaceholderUpgradeUpdates({ phoneE164: '+15551234567' })).toEqual({
        email: null,
        phone_number: '+15551234567',
        login_identifier: '+15551234567',
        is_placeholder: false,
        requires_password_reset: true,
      });
    });
  });
});
