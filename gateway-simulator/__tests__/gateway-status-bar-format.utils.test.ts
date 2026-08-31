import { describe, expect, it } from 'vitest';
import {
  buildFirmwareTooltip,
  buildSnapshotTooltip,
  formatPayloadDetails,
  formatStatusBarTimestamp,
} from '../src/renderer/utils/gateway-status-bar-format.utils';

describe('gateway-status-bar-format.utils', () => {
  it('formatPayloadDetails stringifies objects', () => {
    expect(formatPayloadDetails({ a: 1 })).toBe('{"a":1}');
    expect(formatPayloadDetails(null)).toBe('');
  });

  it('buildFirmwareTooltip includes operation metadata', () => {
    const lines = buildFirmwareTooltip({
      kind: 'firmware-push',
      phase: 'verifying',
      startedAt: '2026-01-01T00:00:00.000Z',
      pushId: 'p1',
      version: '2.0',
      targetType: 'gateway',
      chunksReceived: 1,
      chunkCount: 2,
      error: 'bad sig',
    });
    expect(lines[0]).toContain('firmware push');
    expect(lines.join('\n')).toContain('p1');
    expect(lines.join('\n')).toContain('bad sig');
  });

  it('buildSnapshotTooltip includes snapshot metadata', () => {
    const lines = buildSnapshotTooltip({
      kind: 'inventory-snapshot',
      phase: 'transferring',
      startedAt: '2026-01-01T00:00:00.000Z',
      pushId: 'snap-1',
      chunksReceived: 0,
      chunkCount: 3,
    });
    expect(lines[0]).toContain('inventory snapshot');
    expect(lines.join('\n')).toContain('snap-1');
  });

  it('formatStatusBarTimestamp formats valid ISO timestamps', () => {
    expect(formatStatusBarTimestamp('not-a-date')).toBe('');
    expect(formatStatusBarTimestamp('2026-06-27T12:00:00.000Z')).toMatch(/\d/);
  });
});
