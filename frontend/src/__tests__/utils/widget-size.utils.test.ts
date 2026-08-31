import {
  orderSizesForPlacement,
  snapGridToAllowedSize,
  gridBoundsForAllowedSizes,
  deriveContentTierFromGrid,
  isDockSize,
} from '@/utils/widget-size.utils';

describe('widget-size.utils', () => {
  it('orderSizesForPlacement puts preferred first then smaller sizes', () => {
    expect(
      orderSizesForPlacement('large', ['tiny', 'small', 'medium', 'large'])
    ).toEqual(['large', 'tiny', 'small', 'medium']);
  });

  it('snapGridToAllowedSize picks exact preset when dimensions match', () => {
    expect(snapGridToAllowedSize(2, 2, ['tiny', 'small', 'medium'])).toBe('small');
  });

  it('snapGridToAllowedSize picks nearest area among allowed presets', () => {
    expect(snapGridToAllowedSize(3, 2, ['tiny', 'small', 'medium'])).toBe('medium');
  });

  it('snapGridToAllowedSize prefers matching width/height over area-only match', () => {
    const notificationSizes = [
      'medium',
      'medium-tall',
      'large',
      'large-wide',
      'huge',
      'huge-wide',
    ] as const;
    expect(snapGridToAllowedSize(3, 4, [...notificationSizes])).toBe('medium-tall');
    expect(snapGridToAllowedSize(4, 3, [...notificationSizes])).toBe('large');
  });

  it('gridBoundsForAllowedSizes uses full grid for max, smallest preset for min', () => {
    expect(gridBoundsForAllowedSizes(['tiny', 'large'])).toEqual({
      minW: 1,
      minH: 1,
      maxW: 12,
      maxH: 6,
    });
  });

  it('deriveContentTierFromGrid preserves standard tier on dock-shaped free grids', () => {
    const tier = deriveContentTierFromGrid('units-manager', 12, 3, 'large-wide');
    expect(isDockSize(tier)).toBe(false);
    expect(tier).toBe('large-wide');
  });

  it('deriveContentTierFromGrid snaps when grid leaves dock-shaped footprint', () => {
    expect(deriveContentTierFromGrid('units-manager', 4, 3, 'large-wide')).toBe('large');
  });

  it('deriveContentTierFromGrid preserves explicit dock size', () => {
    expect(deriveContentTierFromGrid('units-manager', 12, 3, 'dock-bottom')).toBe(
      'dock-bottom'
    );
  });
});
