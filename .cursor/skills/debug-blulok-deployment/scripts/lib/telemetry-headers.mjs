/**
 * Gateway telemetry header labels.
 *
 * Cloud system codes (CLD*) are documented in cursorDocs/gateway-integration.md.
 * Hex families (02xx/03xx/10xx/12xx) are inferred from live gateway_ws lines
 * and backend parser fixtures — last two digits are typically direction.
 */

export const CLOUD_SYSTEM_HEADERS = {
  CLD01: 'gateway connected',
  CLD02: 'gateway disconnected',
  CLD03: 'gateway status changed',
  CLD04: 'device inventory sync',
};

export const HEADER_FAMILIES = {
  '02': 'lock command',
  '03': 'device poll / heartbeat',
  '10': 'lock state',
  '12': 'firmware version',
};

export const HEADER_DIRECTIONS = {
  '00': 'rx (from device)',
  '01': 'tx (to device)',
  '02': 'follow-up / lock payload',
};

function normalizeHeader(raw) {
  if (raw == null) return '';
  return String(raw).trim().toUpperCase();
}

function headerFromMessage(message) {
  if (typeof message !== 'string') return '';
  const match = message.match(/Header[:\s]+([0-9A-Fa-f]{4}|CLD\d{2})/i);
  return match ? normalizeHeader(match[1]) : '';
}

export function describeTelemetryHeader(raw) {
  const header = normalizeHeader(raw);
  if (!header) return null;

  if (CLOUD_SYSTEM_HEADERS[header]) {
    return { header, label: CLOUD_SYSTEM_HEADERS[header], kind: 'cloud_system' };
  }

  if (/^[0-9A-F]{4}$/.test(header)) {
    const family = HEADER_FAMILIES[header.slice(0, 2)];
    const direction = HEADER_DIRECTIONS[header.slice(2, 4)];
    const parts = [family, direction].filter(Boolean);
    if (parts.length) {
      return { header, label: parts.join(', '), kind: 'gateway_ws' };
    }
  }

  return { header, label: null, kind: 'unknown' };
}

function compactData(data) {
  if (!data || typeof data !== 'object') return '';
  const bits = [];
  if (data.dev_id) bits.push(`dev ${data.dev_id}`);
  if (data.lock_id) bits.push(`lock ${data.lock_id}`);
  if (data.dev_number != null) bits.push(`#${data.dev_number}`);
  if (data.lock_number != null) bits.push(`#${data.lock_number}`);
  if (data.lock) {
    bits.push(/^\d/.test(String(data.lock)) ? `fw ${data.lock}` : `lock ${data.lock}`);
  }
  if (data.event && data.event !== 'none') bits.push(String(data.event));
  if (data.reason_label) bits.push(String(data.reason_label));
  else if (data.reason && data.reason !== 'none') bits.push(String(data.reason));
  if (data.tid != null) bits.push(`tid ${data.tid}`);
  return bits.join(' · ');
}

export function formatTelemetryLine(log) {
  const payload = log?.payload ?? {};
  const message =
    (typeof payload.message === 'string' && payload.message.trim()) ||
    payload.msg ||
    payload.event ||
    payload.type ||
    '';
  const desc = describeTelemetryHeader(payload.header) ?? describeTelemetryHeader(headerFromMessage(message));
  const dataBits = compactData(payload.data);
  const headerTag = desc
    ? desc.label
      ? `${desc.header} ${desc.label}`
      : desc.header
    : null;
  const text = [message.replace(/\s+/g, ' ').trim(), dataBits].filter(Boolean).join(' — ');
  return {
    header: desc?.header ?? null,
    headerLabel: desc?.label ?? null,
    summary: headerTag ? (text ? `[${headerTag}] ${text}` : `[${headerTag}]`) : text || JSON.stringify(payload).slice(0, 120),
  };
}
