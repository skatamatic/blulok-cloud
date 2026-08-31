/**
 * Keyboard shortcuts for the readonly facility viewer (dashboard widget, BluFMS).
 * Camera height (Z/X) and WASD walk are handled by CameraController input handlers.
 */

import { useEffect, useCallback } from 'react';

interface ViewerKeyboardShortcutsOptions {
  enabled?: boolean;
  onRotateCamera90?: (direction: 'cw' | 'ccw') => void;
}

export function useViewerKeyboardShortcuts(
  options: ViewerKeyboardShortcutsOptions = {}
): void {
  const { enabled = true, onRotateCamera90 } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!event.altKey || event.shiftKey) return;

      const key = event.key.toLowerCase();
      switch (key) {
        case 'arrowleft':
          onRotateCamera90?.('ccw');
          event.preventDefault();
          break;
        case 'arrowright':
          onRotateCamera90?.('cw');
          event.preventDefault();
          break;
      }
    },
    [enabled, onRotateCamera90]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
