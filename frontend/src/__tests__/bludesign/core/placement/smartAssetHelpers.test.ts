import {
  isSmartAssetCategory,
  nextNumberedAssetDisplayName,
} from '../../../../components/bludesign/core/placement/smartAssetHelpers';
import { AssetCategory } from '../../../../components/bludesign/core/types';

describe('smartAssetHelpers', () => {
  it('isSmartAssetCategory matches design categories', () => {
    expect(isSmartAssetCategory(AssetCategory.STORAGE_UNIT)).toBe(true);
    expect(isSmartAssetCategory(AssetCategory.GATE)).toBe(true);
    expect(isSmartAssetCategory(AssetCategory.WALL)).toBe(false);
  });

  it('nextNumberedAssetDisplayName increments per asset id', () => {
    const counters = new Map<string, number>();
    expect(nextNumberedAssetDisplayName('a1', 'Unit', counters)).toBe('Unit 1');
    expect(nextNumberedAssetDisplayName('a1', 'Unit', counters)).toBe('Unit 2');
    expect(nextNumberedAssetDisplayName('b2', 'Door', counters)).toBe('Door 1');
    expect(counters.get('a1')).toBe(2);
    expect(counters.get('b2')).toBe(1);
  });
});
