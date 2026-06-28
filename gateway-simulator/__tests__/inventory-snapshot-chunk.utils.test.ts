import { describe, expect, it } from 'vitest';
import { sha256Hex, verifyInventorySnapshotChunk } from '../src/main/inventory/inventory-snapshot-chunk.utils';

describe('inventory-snapshot-chunk.utils', () => {
  it('sha256Hex matches Node crypto', () => {
    const bytes = Buffer.from('hello snapshot', 'utf8');
    expect(sha256Hex(bytes)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifyInventorySnapshotChunk accepts matching hash', () => {
    const bytes = Buffer.from('chunk-data', 'utf8');
    const expected = sha256Hex(bytes);
    const result = verifyInventorySnapshotChunk(bytes.toString('base64'), expected);
    expect(result.ok).toBe(true);
    expect(result.bytes.equals(bytes)).toBe(true);
    expect(result.actualSha256).toBe(expected);
  });

  it('verifyInventorySnapshotChunk rejects mismatched hash', () => {
    const bytes = Buffer.from('chunk-data', 'utf8');
    const result = verifyInventorySnapshotChunk(bytes.toString('base64'), 'deadbeef');
    expect(result.ok).toBe(false);
  });
});
