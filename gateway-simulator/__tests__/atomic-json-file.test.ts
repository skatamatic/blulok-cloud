import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { atomicWriteJson, readJsonFile } from '../src/main/persistence/atomic-json-file';

describe('atomic-json-file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gw-sim-atomic-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes valid JSON that can be read back', async () => {
    const filePath = join(dir, 'data.json');
    await atomicWriteJson(filePath, { ok: true, items: [1, 2] });

    const raw = await readFile(filePath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ ok: true, items: [1, 2] });
  });

  it('creates a backup before replacing an existing file', async () => {
    const filePath = join(dir, 'data.json');
    await atomicWriteJson(filePath, { version: 1 });
    await atomicWriteJson(filePath, { version: 2 });

    const backup = await readFile(`${filePath}.bak`, 'utf8');
    expect(JSON.parse(backup)).toEqual({ version: 1 });
  });

  it('recovers from backup when primary JSON is corrupted', async () => {
    const filePath = join(dir, 'data.json');
    await atomicWriteJson(filePath, { version: 1 });
    await atomicWriteJson(filePath, { version: 2 });
    await writeFile(filePath, '{ broken', 'utf8');

    const result = await readJsonFile<{ version: number }>(filePath, { version: 0 });
    expect(result.source).toBe('backup');
    expect(result.data.version).toBe(1);
  });

  it('returns fallback when primary and backup are unreadable', async () => {
    const filePath = join(dir, 'missing.json');
    const result = await readJsonFile<string[]>(filePath, []);
    expect(result.source).toBe('fallback');
    expect(result.data).toEqual([]);
  });
});
