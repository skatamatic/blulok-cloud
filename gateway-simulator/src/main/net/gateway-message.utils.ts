/** Summarize WS messages for event logs (pure, testable). */
export function summarizeGatewayMessage(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return String(msg);
  const type = (msg as { type?: string }).type ?? 'unknown';
  if (type === 'COMMAND') {
    const jwt = (msg as { jwt?: string }).jwt;
    if (typeof jwt === 'string') {
      try {
        const parts = jwt.split('.');
        if (parts.length >= 2) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
            cmd_type?: string;
          };
          if (decoded.cmd_type) return `COMMAND ${decoded.cmd_type}`;
        }
      } catch {
        /* fall through */
      }
    }
    return 'COMMAND (jwt)';
  }
  if (type === 'FIRMWARE_CHUNK') return 'FIRMWARE_CHUNK';
  if (type === 'FIRMWARE_MANIFEST') return 'FIRMWARE_MANIFEST';
  if (type === 'PROXY_RESPONSE') {
    return `PROXY_RESPONSE ${(msg as { status?: number }).status}`;
  }
  return type;
}
