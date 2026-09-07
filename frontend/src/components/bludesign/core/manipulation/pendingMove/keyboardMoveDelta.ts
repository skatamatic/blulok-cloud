/**
 * Grid-space delta for keyboard nudge (same convention as `BluDesignEngine.moveSelectionByDirection`).
 */
export function keyboardDirectionToGridDelta(direction: 'up' | 'down' | 'left' | 'right'): {
  deltaX: number;
  deltaZ: number;
} {
  switch (direction) {
    case 'up':
      return { deltaX: 0, deltaZ: -1 };
    case 'down':
      return { deltaX: 0, deltaZ: 1 };
    case 'left':
      return { deltaX: -1, deltaZ: 0 };
    case 'right':
      return { deltaX: 1, deltaZ: 0 };
  }
}
