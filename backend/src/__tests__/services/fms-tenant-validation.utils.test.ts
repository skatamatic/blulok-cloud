import {
  buildFacilityUserLookupMaps,
  deriveFmsTenantValidationErrors,
  findExistingUserForFmsTenant,
  formatFmsTenantContactLabel,
  hasFmsTenantLoginIdentity,
  resolveFmsTenantLoginIdentifier,
  validateFmsTenantSyncFields,
  validateFmsTenantWebhookFields,
} from '@/services/fms/fms-tenant-validation.utils';

describe('fms-tenant-validation.utils', () => {
  describe('hasFmsTenantLoginIdentity', () => {
    it('accepts email only', () => {
      expect(hasFmsTenantLoginIdentity({ email: 'a@b.com' })).toBe(true);
    });

    it('accepts phone only', () => {
      expect(hasFmsTenantLoginIdentity({ phone: '+13450899583' })).toBe(true);
    });

    it('rejects tenant with neither email nor phone', () => {
      expect(hasFmsTenantLoginIdentity({ email: null, phone: '' })).toBe(false);
    });
  });

  describe('resolveFmsTenantLoginIdentifier', () => {
    it('prefers email over phone', () => {
      expect(resolveFmsTenantLoginIdentifier('User@Test.com', '+13450899583')).toBe('user@test.com');
    });

    it('normalizes phone when email is missing', () => {
      expect(resolveFmsTenantLoginIdentifier(null, '3450899583')).toBe('+13450899583');
    });
  });

  describe('validateFmsTenantSyncFields', () => {
    it('accepts phone-only tenant with first and last name', () => {
      expect(
        validateFmsTenantSyncFields({
          email: null,
          phone: '+13450899583',
          firstName: 'Kelvin',
          lastName: 'Benjamin',
        }),
      ).toEqual([]);
    });

    it('rejects tenant missing both email and phone', () => {
      expect(
        validateFmsTenantSyncFields({
          email: '',
          phone: null,
          firstName: 'Kelvin',
          lastName: 'Benjamin',
        }),
      ).toContain('Missing or empty login identity (email or phone number)');
    });

    it('rejects tenant missing first name even with phone', () => {
      expect(
        validateFmsTenantSyncFields({
          phone: '+13450899583',
          firstName: '',
          lastName: 'Benjamin',
        }),
      ).toContain('Missing or empty first name');
    });
  });

  describe('validateFmsTenantWebhookFields', () => {
    it('accepts phone-only tenant with only first name', () => {
      expect(
        validateFmsTenantWebhookFields({
          phone: '+13450899583',
          firstName: 'Kelvin',
        }),
      ).toEqual([]);
    });
  });

  describe('deriveFmsTenantValidationErrors', () => {
    it('does not require email when phone is present', () => {
      expect(
        deriveFmsTenantValidationErrors({
          email: null,
          phone: '+13450899583',
          first_name: 'Kelvin',
          last_name: 'Benjamin',
        }),
      ).toEqual([]);
    });
  });

  describe('formatFmsTenantContactLabel', () => {
    it('shows phone when email is absent', () => {
      expect(formatFmsTenantContactLabel({ email: null, phone: '+13450899583' })).toBe('+13450899583');
    });
  });

  describe('findExistingUserForFmsTenant', () => {
    const users = [
      {
        id: 'user-phone',
        email: null,
        phone_number: '+13450899583',
        login_identifier: '+13450899583',
      },
      {
        id: 'user-email',
        email: 'known@test.com',
        phone_number: null,
        login_identifier: 'known@test.com',
      },
    ];
    const maps = buildFacilityUserLookupMaps(users);

    it('matches existing user by normalized phone when email is missing', () => {
      const found = findExistingUserForFmsTenant(
        { email: null, phone: '3450899583' },
        undefined,
        maps.usersById,
        maps.usersByEmail,
        maps.usersByPhone,
        maps.usersByLoginIdentifier,
      );
      expect(found?.id).toBe('user-phone');
    });

    it('prefers mapping lookup over email/phone matching', () => {
      const found = findExistingUserForFmsTenant(
        { email: 'known@test.com', phone: '+13450899583' },
        { internal_id: 'user-phone' },
        maps.usersById,
        maps.usersByEmail,
        maps.usersByPhone,
        maps.usersByLoginIdentifier,
      );
      expect(found?.id).toBe('user-phone');
    });
  });
});
