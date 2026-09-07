/**
 * Starts placement paste preview when the clipboard has objects (tool switch is injected).
 */

import type { PlacedObject } from '../types';

export interface ClipboardPastePreviewPort {
  hasClipboardContent(): boolean;
  getClipboardObjects(): PlacedObject[];
  startPastePreview(objects: PlacedObject[]): void;
  /** e.g. {@link BluDesignEngine.setTool} with PLACE */
  activatePlaceTool(): void;
}

/**
 * @returns whether paste preview was started
 */
export function tryStartClipboardPastePreview(port: ClipboardPastePreviewPort): boolean {
  if (!port.hasClipboardContent()) {
    return false;
  }
  const objects = port.getClipboardObjects();
  if (objects.length === 0) {
    return false;
  }
  port.startPastePreview(objects);
  port.activatePlaceTool();
  return true;
}
