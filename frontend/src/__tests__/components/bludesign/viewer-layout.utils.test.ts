import {
  shouldUseExpandedViewerChrome,
  VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT,
  VIEWER_EXPANDED_LAYOUT_MIN_WIDTH,
} from '@/components/bludesign/viewer/viewer-layout.utils';

describe('viewer-layout.utils', () => {
  it('uses expanded chrome at or above minimum viewport size', () => {
    expect(
      shouldUseExpandedViewerChrome(
        VIEWER_EXPANDED_LAYOUT_MIN_WIDTH,
        VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT
      )
    ).toBe(true);
    expect(shouldUseExpandedViewerChrome(800, 400)).toBe(true);
  });

  it('uses compact chrome below minimum width or height', () => {
    expect(
      shouldUseExpandedViewerChrome(
        VIEWER_EXPANDED_LAYOUT_MIN_WIDTH - 1,
        VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT
      )
    ).toBe(false);
    expect(
      shouldUseExpandedViewerChrome(
        VIEWER_EXPANDED_LAYOUT_MIN_WIDTH,
        VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT - 1
      )
    ).toBe(false);
  });
});
