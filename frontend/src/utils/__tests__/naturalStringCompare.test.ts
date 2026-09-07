import { compareNaturalStrings } from '../naturalStringCompare';

describe('compareNaturalStrings', () => {
  it('orders numeric unit labels numerically', () => {
    const input = ['Unit 10', 'Unit 2', 'Unit 1'];
    const sorted = [...input].sort(compareNaturalStrings);
    expect(sorted).toEqual(['Unit 1', 'Unit 2', 'Unit 10']);
  });
});
