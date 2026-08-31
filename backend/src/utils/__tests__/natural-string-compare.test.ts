import { compareNaturalStrings } from '../natural-string-compare';

describe('compareNaturalStrings', () => {
  it('orders numeric unit labels numerically', () => {
    const input = ['Unit 10', 'Unit 2', 'Unit 1'];
    const sorted = [...input].sort(compareNaturalStrings);
    expect(sorted).toEqual(['Unit 1', 'Unit 2', 'Unit 10']);
  });

  it('handles mixed alphanumeric prefixes', () => {
    const input = ['A-10', 'A-2', 'B-1'];
    const sorted = [...input].sort(compareNaturalStrings);
    expect(sorted).toEqual(['A-2', 'A-10', 'B-1']);
  });

  it('treats empty strings consistently', () => {
    expect(compareNaturalStrings('', 'a')).toBeLessThan(0);
    expect(compareNaturalStrings('a', '')).toBeGreaterThan(0);
  });
});
