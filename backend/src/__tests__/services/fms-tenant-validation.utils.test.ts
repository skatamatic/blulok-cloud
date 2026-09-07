import {
  deriveFmsTenantValidationErrors,
  findExistingUserForFmsTenant,
  formatFmsTenantContactLabel,
  hasFmsTenantLoginIdentity,
  refreshPendingTenantChangeForDisplay,
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

    it('accepts tenant missing both email and phone (placeholder)', () => {
      expect(
        validateFmsTenantSyncFields({
          email: '',
          phone: null,
          firstName: 'Kelvin',
          lastName: 'Benjamin',
        }),
      ).toEqual([]);
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

    it('accepts tenant missing both email and phone (placeholder)', () => {
      expect(
        validateFmsTenantWebhookFields({
          email: null,
          phone: '',
          firstName: 'Edythe',
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

    it('labels missing contact as placeholder — no login', () => {
      expect(formatFmsTenantContactLabel({ email: null, phone: null })).toBe('placeholder — no login');
    });
  });

  describe('refreshPendingTenantChangeForDisplay', () => {
    it('clears obsolete contact identity errors so no-contact tenants become valid', () => {
      const refreshed = refreshPendingTenantChangeForDisplay({
        entity_type: 'tenant' as const,
        is_valid: false,
        validation_errors: ['Missing or empty username (email)'],
        impact_summary: 'New tenant: Edythe Orn (no email) - Will be added to 1 unit(s)',
        after_data: { email: null, phone: null, firstName: 'Edythe', lastName: 'Orn' },
      });

      expect(refreshed.is_valid).toBe(true);
      expect(refreshed.validation_errors).toEqual([]);
      expect(refreshed.impact_summary).toContain('placeholder — no login');
      expect(refreshed.impact_summary).not.toContain('(no email)');
    });

    it('marks phone-only tenants valid when stale email-only error is present', () => {
      const refreshed = refreshPendingTenantChangeForDisplay({
        entity_type: 'tenant' as const,
        is_valid: false,
        validation_errors: ['Missing or empty username (email)'],
        impact_summary: 'New tenant: Kelvin Benjamin (no email) - Will be added to 1 unit(s)',
        after_data: {
          email: null,
          phone: '+13450899583',
          firstName: 'Kelvin',
          lastName: 'Benjamin',
        },
      });

      expect(refreshed.is_valid).toBe(true);
      expect(refreshed.validation_errors).toEqual([]);
      expect(refreshed.impact_summary).toContain('+13450899583');
    });

    it('strips obsolete contact errors while preserving unrelated validation errors', () => {
      const refreshed = refreshPendingTenantChangeForDisplay({
        entity_type: 'tenant' as const,
        is_valid: false,
        validation_errors: [
          'Missing or empty username (email)',
          'Tenant is not mapped in BluLok yet',
        ],
        impact_summary: 'Create tenant from webhook',
        after_data: { email: null, phone: null, firstName: 'A', lastName: 'B' },
      });

      expect(refreshed.validation_errors).toEqual([
        'Tenant is not mapped in BluLok yet',
      ]);
      expect(refreshed.is_valid).toBe(false);
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

    it('matches existing user by normalized phone when email is missing', () => {
      const found = findExistingUserForFmsTenant(
        { email: null, phone: '3450899583' },
        undefined,
        users,
      );
      expect(found?.id).toBe('user-phone');
    });

    it('prefers mapping lookup over email/phone matching', () => {
      const found = findExistingUserForFmsTenant(
        { email: 'known@test.com', phone: '+13450899583' },
        { internal_id: 'user-phone' },
        users,
      );
      expect(found?.id).toBe('user-phone');
    });

    it('does not match a shared phone when the tenant also has an email', () => {
      const shared = [
        ...users,
        {
          id: 'user-shared-phone',
          email: 'other@test.com',
          phone_number: '+13450899583',
          login_identifier: 'other@test.com',
        },
      ];
      const found = findExistingUserForFmsTenant(
        { email: 'brand-new@test.com', phone: '+13450899583' },
        undefined,
        shared,
      );
      expect(found).toBeUndefined();
    });
  });
});
