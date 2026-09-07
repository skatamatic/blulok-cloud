/**
 * Renders a downscaled JPEG data URL for thumbnails (grid hidden during capture).
 */

export function computeScaledThumbnailDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxSize: number
): { width: number; height: number } {
  const aspect = sourceWidth / sourceHeight;
  if (aspect > 1) {
    return { width: maxSize, height: Math.round(maxSize / aspect) };
  }
  return { width: Math.round(maxSize * aspect), height: maxSize };
}

export interface CaptureSceneThumbnailJpegDeps {
  /** Whether the grid was visible before capture (restored after). */
  wasGridVisible: boolean;
  setGridVisible(visible: boolean): void;
  render(): void;
  getSourceCanvas(): HTMLCanvasElement;
}

/**
 * Hides grid, renders, scales to `maxSize` on the long edge, returns JPEG data URL.
 */
export async function captureSceneThumbnailJpeg(
  maxSize: number,
  deps: CaptureSceneThumbnailJpegDeps
): Promise<string> {
  if (deps.wasGridVisible) {
    deps.setGridVisible(false);
  }

  deps.render();

  const originalCanvas = deps.getSourceCanvas();
  const offscreen = document.createElement('canvas');
  const { width, height } = computeScaledThumbnailDimensions(
    originalCanvas.width,
    originalCanvas.height,
    maxSize
  );

  offscreen.width = width;
  offscreen.height = height;

  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    if (deps.wasGridVisible) {
      deps.setGridVisible(true);
      deps.render();
    }
    return originalCanvas.toDataURL('image/jpeg', 0.7);
  }

  ctx.drawImage(originalCanvas, 0, 0, width, height);

  if (deps.wasGridVisible) {
    deps.setGridVisible(true);
    deps.render();
  }

  return offscreen.toDataURL('image/jpeg', 0.7);
}
