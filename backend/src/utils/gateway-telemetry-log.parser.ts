/**
 * Parse gateway telemetry log lines into timestamp + JSON payload.
 * Messages are heterogeneous — no fixed schema beyond optional Header/Payload tail.
 */

export type GatewayTelemetryLogPayload = Record<string, unknown>;

export interface ParsedGatewayTelemetryLog {
  logged_at: Date;
  payload: GatewayTelemetryLogPayload;
}

const TIMESTAMP_PREFIX =
  /^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?|\d{4}-\d{2}-\d{2} [\d:.]+)\s+/;

const HEADER_PAYLOAD_TAIL =
  /\nHeader\s+([0-9A-Fa-f]+),\s*Payload\s+(\{[\s\S]*\})\s*$/;

function parseTimestamp(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized =
    !hasTimezone && /^\d{4}-\d{2}-\d{2}[T ]\d/.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (Array.isArray(value)) {
      return { items: value };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseGatewayTelemetryLogLine(rawLine: string, fallbackDate: Date = new Date()): ParsedGatewayTelemetryLog {
  const raw = String(rawLine ?? '').trim();
  if (!raw) {
    return {
      logged_at: fallbackDate,
      payload: { message: '' },
    };
  }

  const asJson = tryParseJsonObject(raw);
  if (asJson) {
    return {
      logged_at: fallbackDate,
      payload: asJson,
    };
  }

  const headerMatch = raw.match(HEADER_PAYLOAD_TAIL);
  if (headerMatch) {
    const prefixEnd = raw.length - headerMatch[0].length;
    const prefix = raw.slice(0, prefixEnd).trim();
    const tsMatch = prefix.match(TIMESTAMP_PREFIX);
    let logged_at = fallbackDate;
    let message = prefix;
    if (tsMatch) {
      const parsed = parseTimestamp(tsMatch[1]);
      if (parsed) logged_at = parsed;
      message = prefix.slice(tsMatch[0].length).trim();
    }

    let data: Record<string, unknown> | null = null;
    try {
      const parsedPayload = JSON.parse(headerMatch[2]) as unknown;
      if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
        data = parsedPayload as Record<string, unknown>;
      }
    } catch {
      data = null;
    }

    const payload: GatewayTelemetryLogPayload = {
      header: headerMatch[1],
      message: message || undefined,
    };
    if (data) {
      payload.data = data;
    }
    return { logged_at, payload };
  }

  const tsMatch = raw.match(TIMESTAMP_PREFIX);
  if (tsMatch) {
    const parsed = parseTimestamp(tsMatch[1]);
    const logged_at = parsed ?? fallbackDate;
    const remainder = raw.slice(tsMatch[0].length).trim();
    return {
      logged_at,
      payload: { message: remainder || raw },
    };
  }

  return {
    logged_at: fallbackDate,
    payload: { message: raw },
  };
}

/** Convert dot path (e.g. data.lock_id) to JSON path segments for JSON_EXTRACT. */
export function sanitizePayloadPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const segments = trimmed.split('.').filter(Boolean);
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (!/^[a-zA-Z0-9_]+$/.test(seg)) return null;
  }
  return payloadPathToJsonExtract(trimmed);
}

export function payloadPathToJsonExtract(path: string): string {
  const segments = path.trim().split('.').filter(Boolean);
  if (segments.length === 0) return '$';
  return `$${segments.map((s) => `.${s}`).join('')}`;
}
