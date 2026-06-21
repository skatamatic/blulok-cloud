import { getUserDisplayName, getUserInitials } from '@/utils/userDisplay.utils';

describe('userDisplay.utils', () => {
  it('builds initials from first and last name', () => {
    expect(getUserInitials({ first_name: 'Jane', last_name: 'Doe', email: 'j@example.com' })).toBe('JD');
  });

  it('falls back to email when names are missing', () => {
    expect(getUserInitials({ email: 'tenant@example.com' })).toBe('T');
    expect(getUserDisplayName({ email: 'tenant@example.com' })).toBe('tenant@example.com');
  });

  it('uses User label when nothing is available', () => {
    expect(getUserDisplayName({})).toBe('User');
    expect(getUserInitials({})).toBe('?');
  });
});
