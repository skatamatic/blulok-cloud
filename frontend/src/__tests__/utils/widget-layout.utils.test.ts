import {
  getWidgetLayoutProfile,
  getWidgetListCap,
  isWideWidgetSize,
  isTallWidgetSize,
  inferFreeGridLayoutShape,
  STANDARD_WIDGET_HEADER,
} from '@/utils/widget-layout.utils';
import { contentTierForUndock } from '@/utils/widget-size.utils';

describe('widget-layout.utils', () => {
  it('treats dock-bottom as wide horizontal dock', () => {
    const profile = getWidgetLayoutProfile('dock-bottom');
    expect(profile.isDock).toBe(true);
    expect(profile.isHorizontalDock).toBe(true);
    expect(profile.isWide).toBe(true);
    expect(profile.listCap).toBeGreaterThan(5);
  });

  it('treats dock-left as vertical dock', () => {
    const profile = getWidgetLayoutProfile('dock-left');
    expect(profile.isVerticalDock).toBe(true);
    expect(profile.isHorizontalDock).toBe(false);
  });

  it('fullscreen profile increases list cap', () => {
    const normal = getWidgetListCap('medium');
    const full = getWidgetListCap('medium', true);
    expect(full).toBeGreaterThan(normal);
  });

  it('isWideWidgetSize includes huge-wide and dock-bottom', () => {
    expect(isWideWidgetSize('huge-wide')).toBe(true);
    expect(isWideWidgetSize('dock-bottom')).toBe(true);
    expect(isWideWidgetSize('dock-left')).toBe(false);
  });

  it('isTallWidgetSize includes medium-tall and dock-bottom-two-thirds', () => {
    expect(isTallWidgetSize('medium-tall')).toBe(true);
    expect(isTallWidgetSize('dock-bottom-two-thirds')).toBe(true);
    expect(isTallWidgetSize('small')).toBe(false);
  });

  it('inferFreeGridLayoutShape matches dock preset footprints', () => {
    expect(inferFreeGridLayoutShape(12, 3)).toBe('horizontal-strip');
    expect(inferFreeGridLayoutShape(12, 4)).toBe('two-thirds-panel');
    expect(inferFreeGridLayoutShape(12, 6)).toBe('full-panel');
    expect(inferFreeGridLayoutShape(6, 6)).toBe('vertical-strip');
  });

  it('undocked 12×3 grid keeps dock-bottom interior layout profile', () => {
    const docked = getWidgetLayoutProfile('dock-bottom');
    const undocked = getWidgetLayoutProfile('large-wide', { gridW: 12, gridH: 3 });
    expect(undocked.isHorizontalDock).toBe(docked.isHorizontalDock);
    expect(undocked.isWide).toBe(docked.isWide);
    expect(undocked.density).toBe(docked.density);
    expect(undocked.listCap).toBe(docked.listCap);
    expect(undocked.shell).toEqual(docked.shell);
  });

  it('uses the same header chrome for small, medium, large, dock, and fullscreen', () => {
    const sizes = ['small', 'medium', 'large', 'huge-wide', 'dock-bottom'] as const;
    for (const size of sizes) {
      const { shell } = getWidgetLayoutProfile(size);
      expect(shell.headerPadding).toBe(STANDARD_WIDGET_HEADER.headerPadding);
      expect(shell.titleSize).toBe(STANDARD_WIDGET_HEADER.titleSize);
      expect(shell.headerActionPadding).toBe(STANDARD_WIDGET_HEADER.headerActionPadding);
      expect(shell.headerIconSize).toBe(STANDARD_WIDGET_HEADER.headerIconSize);
    }
    const fullscreen = getWidgetLayoutProfile('medium', { isFullscreen: true });
    expect(fullscreen.shell.titleSize).toBe(STANDARD_WIDGET_HEADER.titleSize);
    expect(fullscreen.shell.headerIconSize).toBe(STANDARD_WIDGET_HEADER.headerIconSize);
  });

  it('contentTierForUndock maps dock-bottom to large-wide for units-manager', () => {
    expect(contentTierForUndock('dock-bottom', 'units-manager', 12, 3)).toBe('large-wide');
  });
});
