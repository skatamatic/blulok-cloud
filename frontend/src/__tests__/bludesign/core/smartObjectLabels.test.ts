import {
  compareSmartObjectNames,
  formatStorageUnitDisplayName,
  normalizeUnitLabelForSort,
} from '@/components/bludesign/core/smartObjectLabels';

describe('smartObjectLabels', () => {
  describe('formatStorageUnitDisplayName', () => {
    it('prefixes bare numeric labels', () => {
      expect(formatStorageUnitDisplayName('24')).toBe('Unit 24');
      expect(formatStorageUnitDisplayName('24A')).toBe('Unit 24A');
      expect(formatStorageUnitDisplayName('100')).toBe('Unit 100');
    });

    it('leaves already-prefixed labels unchanged', () => {
      expect(formatStorageUnitDisplayName('Unit 24')).toBe('Unit 24');
      expect(formatStorageUnitDisplayName('Unit 24A (F2)')).toBe('Unit 24A (F2)');
    });

    it('prefixes numeric labels with floor suffix', () => {
      expect(formatStorageUnitDisplayName('24 (F2)')).toBe('Unit 24 (F2)');
    });

    it('does not prefix non-numeric asset names', () => {
      expect(formatStorageUnitDisplayName('Medium Unit (Smart)')).toBe('Medium Unit (Smart)');
    });
  });

  describe('normalizeUnitLabelForSort', () => {
    it('strips Unit prefix and floor suffix', () => {
      expect(normalizeUnitLabelForSort('Unit 24A (F2)')).toBe('24A');
      expect(normalizeUnitLabelForSort('24')).toBe('24');
    });
  });

  describe('compareSmartObjectNames', () => {
    it('sorts like import view pseudo-alphabetics', () => {
      const names = ['Unit 25B', '24', '25', 'Unit 24A', '25A', '100', '9'];
      const sorted = [...names].sort(compareSmartObjectNames);
      expect(sorted).toEqual(['9', '24', 'Unit 24A', '25', '25A', 'Unit 25B', '100']);
    });
  });
});
