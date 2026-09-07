import { createHash } from 'crypto';

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function verifyInventorySnapshotChunk(dataBase64: string, expectedSha256: string): {
  ok: boolean;
  bytes: Buffer;
  actualSha256: string;
} {
  const bytes = Buffer.from(dataBase64, 'base64');
  const actualSha256 = sha256Hex(bytes);
  return { ok: actualSha256 === expectedSha256, bytes, actualSha256 };
}
