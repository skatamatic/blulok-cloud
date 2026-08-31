/**
 * UI Capture State
 * 
 * Simple global state to track when UI elements are capturing mouse events.
 * This prevents the 3D scene from stealing mouse events during UI interactions
 * like panel dragging and resizing.
 */

// Global capture state - shared between FloatingPanel and InputCoordinator
let isCapturing = false;
let captureId: string | null = null;

/**
 * Start UI capture - call when a UI drag/resize operation begins
 * @param id - Optional identifier for the capturing element
 */
export function startUICapture(id?: string): void {
  isCapturing = true;
  captureId = id ?? 'unknown';
}

/**
 * End UI capture - call when a UI drag/resize operation ends
 */
export function endUICapture(): void {
  isCapturing = false;
  captureId = null;
}

/**
 * Check if UI is currently capturing mouse events
 */
export function isUICapturing(): boolean {
  return isCapturing;
}

/**
 * Get the ID of the capturing element (for debugging)
 */
export function getCaptureId(): string | null {
  return captureId;
}

