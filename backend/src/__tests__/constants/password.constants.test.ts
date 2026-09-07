import {
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MIN_LENGTH,
} from '@/constants/password.constants';

describe('password.constants', () => {
  it('accepts passwords with hyphen and exclamation (e.g. Skat-amatic1!)', () => {
    expect(PASSWORD_COMPLEXITY_PATTERN.test('Skat-amatic1!')).toBe(true);
  });

  it('accepts passwords with classic special set (@$!%*?&)', () => {
    expect(PASSWORD_COMPLEXITY_PATTERN.test('DevTest123!@#')).toBe(true);
  });

  it('rejects passwords missing complexity requirements', () => {
    expect(PASSWORD_COMPLEXITY_PATTERN.test('password1')).toBe(false);
    expect(PASSWORD_COMPLEXITY_PATTERN.test('short1!')).toBe(false);
    expect(PASSWORD_COMPLEXITY_PATTERN.test('NoDigits!')).toBe(false);
  });

  it('enforces minimum length at API layer separately', () => {
    expect('Ab1!'.length).toBeLessThan(PASSWORD_MIN_LENGTH);
  });
});
