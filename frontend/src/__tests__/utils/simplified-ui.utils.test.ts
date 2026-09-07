import { UserRole } from '@/types/auth.types';
import { usesSimplifiedUi } from '@/utils/simplified-ui.utils';

describe('usesSimplifiedUi', () => {
  it('returns false when user is missing', () => {
    expect(usesSimplifiedUi(null)).toBe(false);
    expect(usesSimplifiedUi(undefined)).toBe(false);
  });

  it('returns true only for facility_admin with simplifiedUi', () => {
    expect(
      usesSimplifiedUi({
        id: '1',
        email: 'fa@example.com',
        firstName: 'F',
        lastName: 'A',
        role: UserRole.FACILITY_ADMIN,
        simplifiedUi: true,
      }),
    ).toBe(true);
  });

  it('returns false for facility_admin without the flag', () => {
    expect(
      usesSimplifiedUi({
        id: '1',
        email: 'fa@example.com',
        firstName: 'F',
        lastName: 'A',
        role: UserRole.FACILITY_ADMIN,
        simplifiedUi: false,
      }),
    ).toBe(false);
  });

  it('returns false for admin even if simplifiedUi is set', () => {
    expect(
      usesSimplifiedUi({
        id: '1',
        email: 'a@example.com',
        firstName: 'A',
        lastName: 'D',
        role: UserRole.ADMIN,
        simplifiedUi: true,
      }),
    ).toBe(false);
  });
});
