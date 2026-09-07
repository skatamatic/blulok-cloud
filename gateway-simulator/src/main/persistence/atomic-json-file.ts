import { copyFile, mkdir, open, readFile, rename, unlink, writeFile } from 'fs/promises';
import { dirname } from 'path';

export type JsonReadSource = 'primary' | 'backup' | 'fallback';

export type JsonReadResult<T> = {
  data: T;
  source: JsonReadSource;
};

function backupPath(filePath: string): string {
  return `${filePath}.bak`;
}

async function replaceFile(tempPath: string, targetPath: string): Promise<void> {
  try {
    await rename(tempPath, targetPath);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EPERM' || code === 'EEXIST') {
      await unlink(targetPath).catch(() => undefined);
      await rename(tempPath, targetPath);
      return;
    }
    throw error;
  }
}

/** Write JSON atomically: temp file → fsync → backup previous → rename into place. */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await writeFile(tempPath, payload, 'utf8');

  const handle = await open(tempPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await copyFile(filePath, backupPath(filePath));
  } catch {
    /* first write or missing primary — no backup yet */
  }

  try {
    await replaceFile(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function tryParseJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Read JSON from primary path, then `.bak`, then return fallback. */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<JsonReadResult<T>> {
  const primary = await tryParseJsonFile<T>(filePath);
  if (primary !== null) {
    return { data: primary, source: 'primary' };
  }

  const backup = await tryParseJsonFile<T>(backupPath(filePath));
  if (backup !== null) {
    return { data: backup, source: 'backup' };
  }

  return { data: fallback, source: 'fallback' };
}

export function safeProfileFileName(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
}
