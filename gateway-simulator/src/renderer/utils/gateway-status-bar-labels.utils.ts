export function readPayloadType(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const type = (payload as { type?: string }).type;
  return typeof type === 'string' ? type : null;
}

export function decodeJwtCommandType(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as { type?: string; jwt?: string; commandType?: string };
  if (typeof obj.commandType === 'string') return obj.commandType;
  if (obj.type !== 'COMMAND' || typeof obj.jwt !== 'string') return null;
  try {
    const parts = obj.jwt.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64)) as { cmd_type?: string };
    return decoded.cmd_type ?? null;
  } catch {
    return null;
  }
}

export function readInboundCommandLabel(payload: unknown): string | null {
  const cmdType = decodeJwtCommandType(payload);
  if (cmdType) return humanizeCommandType(cmdType);
  const type = readPayloadType(payload);
  if (!type || type === 'COMMAND') return null;
  return humanizeCommandType(type);
}

export function humanizeCommandType(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function proxyPathLabel(path: string, method = 'POST'): string {
  if (path.includes('/devices/inventory')) return 'inventory sync';
  if (path.includes('/devices/state')) return 'state sync';
  if (path.includes('/access-events')) return 'access event';
  if (path.includes('/add_log')) return 'telemetry log';
  return `${method} ${path}`;
}

export function parseHttpStatus(summary: string): number | null {
  const match = /HTTP (\d+)/.exec(summary);
  return match ? Number.parseInt(match[1], 10) : null;
}
