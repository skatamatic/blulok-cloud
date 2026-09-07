import type { JwtCommandPayload } from '@protocol/commands';

export function decodeJwtPayload(jwt: string): JwtCommandPayload {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT format');
  const payloadB64 = parts[1];
  const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
  return JSON.parse(json) as JwtCommandPayload;
}

export function normalizeInboundCommand(raw: unknown): JwtCommandPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type === 'COMMAND' && typeof obj.jwt === 'string') {
    try {
      return decodeJwtPayload(obj.jwt);
    } catch {
      return null;
    }
  }

  if (typeof obj.jwt === 'string') {
    try {
      return decodeJwtPayload(obj.jwt);
    } catch {
      return null;
    }
  }

  if (obj.type === 'FIRMWARE_MANIFEST' && typeof obj.jwt === 'string') {
    return decodeJwtPayload(obj.jwt);
  }
  if (obj.type === 'FIRMWARE_CHUNK' && typeof obj.jwt === 'string') {
    return decodeJwtPayload(obj.jwt);
  }

  if (obj.cmd_type && typeof obj.cmd_type === 'string') {
    return obj as JwtCommandPayload;
  }

  if (Array.isArray(raw) && raw.length >= 1 && typeof raw[0] === 'object') {
    return raw[0] as JwtCommandPayload;
  }

  return null;
}
