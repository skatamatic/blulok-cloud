import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';

export const TELEMETRY_LOGS_PAGE_SIZE = 500;
export const TELEMETRY_LOGS_UI_MAX_ROWS = 1000;

export interface PayloadFilterChip {
  id: string;
  path: string;
  value: string;
  op: 'eq' | 'contains';
}

export type TelemetryLogSourceFilter = '' | 'gateway_ws' | 'cloud_system';

export interface TelemetryLogFilterState {
  from?: string;
  to?: string;
  search: string;
  source: TelemetryLogSourceFilter;
  payloadFilters: PayloadFilterChip[];
}

/** Convert datetime-local input value to ISO UTC for the API. */
export function datetimeLocalToIso(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function getValueAtPath(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj || !path.trim()) return undefined;
  const segments = path.trim().split('.').filter(Boolean);
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

export function walkPayloadKeys(obj: unknown, prefix = '', out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 4 || obj == null) return out;
  if (typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.add(path);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      walkPayloadKeys(value, path, out, depth + 1);
    }
  }
  return out;
}

export function logMatchesFilters(
  log: GatewayTelemetryLogRecord,
  opts: TelemetryLogFilterState,
): boolean {
  const loggedAt = new Date(log.logged_at).getTime();
  if (opts.from) {
    const fromMs = new Date(opts.from).getTime();
    if (!Number.isNaN(fromMs) && loggedAt < fromMs) return false;
  }
  if (opts.to) {
    const toMs = new Date(opts.to).getTime();
    if (!Number.isNaN(toMs) && loggedAt > toMs) return false;
  }

  if (opts.source === 'cloud_system') {
    if (log.source !== 'cloud_system' && log.payload?.cloud_system !== true) return false;
  } else if (opts.source === 'gateway_ws') {
    if (log.source === 'cloud_system' || log.payload?.cloud_system === true) return false;
  }

  const payloadStr = JSON.stringify(log.payload ?? {});
  if (opts.search?.trim()) {
    const term = opts.search.trim().toLowerCase();
    if (!payloadStr.toLowerCase().includes(term)) return false;
  }

  for (const chip of opts.payloadFilters) {
    const extracted = getValueAtPath(log.payload, chip.path);
    const str = extracted == null ? '' : String(extracted);
    if (chip.op === 'contains') {
      if (!str.toLowerCase().includes(chip.value.toLowerCase())) return false;
    } else if (str !== chip.value) {
      return false;
    }
  }

  return true;
}

export function buildTelemetryLogQueryParams(filters: TelemetryLogFilterState): Record<string, string | undefined> {
  const primaryPayload = filters.payloadFilters[0];
  return {
    from: datetimeLocalToIso(filters.from),
    to: datetimeLocalToIso(filters.to),
    search: filters.search.trim() || undefined,
    source: filters.source || undefined,
    payload_path: primaryPayload?.path,
    payload_value: primaryPayload?.value,
    payload_op: primaryPayload?.op,
  };
}

export function applyClientSideTelemetryFilters(
  logs: GatewayTelemetryLogRecord[],
  filters: TelemetryLogFilterState,
): GatewayTelemetryLogRecord[] {
  if (filters.payloadFilters.length <= 1) {
    return logs;
  }
  return logs.filter((log) => logMatchesFilters(log, filters));
}

export function payloadStrPreview(payload: Record<string, unknown> | null): string {
  if (!payload) return '(empty)';
  const str = JSON.stringify(payload);
  return str.length > 120 ? `${str.slice(0, 120)}…` : str;
}

export function isEmptyFilterState(filters: TelemetryLogFilterState): boolean {
  return (
    !filters.from &&
    !filters.to &&
    !filters.search.trim() &&
    !filters.source &&
    filters.payloadFilters.length === 0
  );
}

/** True when draft differs from applied, including an unsaved JSON path/value pair. */
export function isTelemetryFilterDraftDirty(
  draft: TelemetryLogFilterState,
  applied: TelemetryLogFilterState,
  pendingPath: string,
  pendingValue: string,
): boolean {
  if (draft.from !== applied.from) return true;
  if (draft.to !== applied.to) return true;
  if (draft.search.trim() !== applied.search) return true;
  if ((draft.source ?? '') !== (applied.source ?? '')) return true;
  if (JSON.stringify(draft.payloadFilters) !== JSON.stringify(applied.payloadFilters)) return true;
  if (pendingPath.trim() && pendingValue.trim()) return true;
  return false;
}

/** Merge a pending JSON path/value into filter state when Apply is used. */
export function mergePendingPayloadFilter(
  filters: TelemetryLogFilterState,
  pendingPath: string,
  pendingValue: string,
  pendingOp: 'eq' | 'contains',
): { filters: TelemetryLogFilterState; clearedPending: boolean } {
  const path = pendingPath.trim();
  const value = pendingValue.trim();
  if (!path || !value) {
    return { filters, clearedPending: false };
  }
  const duplicate = filters.payloadFilters.some(
    (chip) => chip.path === path && chip.value === value && chip.op === pendingOp,
  );
  if (duplicate) {
    return { filters, clearedPending: true };
  }
  return {
    filters: {
      ...filters,
      payloadFilters: [
        ...filters.payloadFilters,
        { id: `${path}-${Date.now()}`, path, value, op: pendingOp },
      ],
    },
    clearedPending: true,
  };
}
