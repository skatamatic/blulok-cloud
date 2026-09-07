import { describe, expect, it } from 'vitest';
import { formatReconnectLabel } from '../src/renderer/hooks/useReconnectCountdown';

describe('useReconnectCountdown helpers', () => {
  it('formats singular and plural reconnect labels', () => {
    expect(formatReconnectLabel(5)).toBe('Reconnecting in 5s…');
    expect(formatReconnectLabel(1)).toBe('Reconnecting in 1s…');
  });
});
