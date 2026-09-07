import { compareUnitLabels } from '@/components/bludesign/layout-import/unitLabelSort';

describe('compareUnitLabels', () => {
  it('sorts by numeric core then suffix', () => {
    const labels = ['25B', '24', '25', '24A', '25A', '24B', '100', '9'];
    const sorted = [...labels].sort(compareUnitLabels);
    expect(sorted).toEqual(['9', '24', '24A', '24B', '25', '25A', '25B', '100']);
  });

  it('treats bare number before same-number suffixed variants', () => {
    expect(compareUnitLabels('24', '24A')).toBeLessThan(0);
    expect(compareUnitLabels('24A', '24B')).toBeLessThan(0);
  });

  it('is case-insensitive on suffixes', () => {
    expect(compareUnitLabels('24a', '24B')).toBeLessThan(0);
    expect(compareUnitLabels('24A', '24a')).toBe(0);
  });

  it('puts unlabeled and non-numeric labels after numeric ones', () => {
    expect(compareUnitLabels('24', 'Office')).toBeLessThan(0);
    expect(compareUnitLabels('', '24')).toBeGreaterThan(0);
    expect(compareUnitLabels(undefined, '24')).toBeGreaterThan(0);
  });

  it('sorts non-numeric labels alphabetically among themselves', () => {
    expect(compareUnitLabels('Office', 'Warehouse')).toBeLessThan(0);
  });
});
