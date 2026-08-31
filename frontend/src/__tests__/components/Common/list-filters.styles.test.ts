import {
  countActiveFilterSections,
  filterChipClassName,
  filterSectionSpanClass,
} from '@/components/Common/list-filters.styles';

describe('list-filters.styles', () => {
  describe('countActiveFilterSections', () => {
    it('counts search and non-default section selections', () => {
      const count = countActiveFilterSections('query', [
        { title: 'Status', selected: '' },
        { title: 'Unit Type', selected: 'small' },
        { title: 'Lock Status', selected: 'all' },
      ]);

      expect(count).toBe(2);
    });

    it('ignores custom date range placeholder selection', () => {
      const count = countActiveFilterSections('', [
        { title: 'Date Range', selected: 'custom' },
        { title: 'Status', selected: 'available' },
      ]);

      expect(count).toBe(1);
    });

    it('ignores operational device scope default', () => {
      const count = countActiveFilterSections('', [
        { title: 'Device Scope', selected: 'operational' },
        { title: 'Status', selected: 'online' },
      ]);

      expect(count).toBe(1);
    });
  });

  describe('filterSectionSpanClass', () => {
    it('returns full-width grid span when span is full', () => {
      expect(filterSectionSpanClass({ span: 'full' })).toContain('col-span');
    });
  });

  describe('filterChipClassName', () => {
    it('applies selected primary styles', () => {
      const className = filterChipClassName(true, 'primary');
      expect(className).toContain('bg-primary-50');
      expect(className).toContain('ring-primary-200');
    });

    it('applies idle styles when not selected', () => {
      const className = filterChipClassName(false, 'green');
      expect(className).toContain('bg-white');
      expect(className).not.toContain('bg-green-50');
    });
  });
});
