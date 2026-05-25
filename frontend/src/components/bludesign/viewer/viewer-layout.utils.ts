/** Minimum viewport size to use split chrome (camera center, object finder corner). */
export const VIEWER_EXPANDED_LAYOUT_MIN_WIDTH = 480;
export const VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT = 260;

export function shouldUseExpandedViewerChrome(width: number, height: number): boolean {
  return width >= VIEWER_EXPANDED_LAYOUT_MIN_WIDTH && height >= VIEWER_EXPANDED_LAYOUT_MIN_HEIGHT;
}
