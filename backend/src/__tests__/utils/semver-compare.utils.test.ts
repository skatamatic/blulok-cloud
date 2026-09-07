import { compareSemver, pickHighestSemver } from '@/utils/semver-compare.utils';

describe('semver-compare.utils', () => {
  it('compareSemver orders versions correctly', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('2.1.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
  });

  it('pickHighestSemver selects highest gateway firmware', () => {
    const picked = pickHighestSemver([
      { id: 'a', version: '1.0.0' },
      { id: 'b', version: '2.0.0' },
      { id: 'c', version: '1.5.0' },
    ]);
    expect(picked?.id).toBe('b');
  });
});
