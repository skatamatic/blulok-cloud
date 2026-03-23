import {
  WIDGET_SIZE_TO_GRID,
  sizeToGrid,
  gridToSize,
  getAvailableSizes,
  isValidSize,
} from '@/utils/widget-size.utils';
import { WidgetSize } from '@/types/widget.types';

describe('widget-size.utils', () => {
  it('WIDGET_SIZE_TO_GRID has every size key', () => {
    expect(WIDGET_SIZE_TO_GRID.tiny).toEqual({ w: 1, h: 1 });
    expect(WIDGET_SIZE_TO_GRID['mega-tall']).toEqual({ w: 3, h: 6 });
  });

  it('sizeToGrid returns mapping or fallback', () => {
    expect(sizeToGrid('small')).toEqual({ w: 2, h: 1 });
    expect(sizeToGrid('unknown' as WidgetSize)).toEqual({ w: 3, h: 2 });
  });

  it('gridToSize finds exact match then closest by area', () => {
    expect(gridToSize(1, 1)).toBe('tiny');
    expect(gridToSize(3, 2)).toBe('medium');
  });

  it('getAvailableSizes and isValidSize', () => {
    expect(getAvailableSizes()).toContain('large');
    expect(isValidSize('medium')).toBe(true);
    expect(isValidSize('nope')).toBe(false);
  });
});
