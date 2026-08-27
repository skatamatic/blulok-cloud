import { buildQuery } from './api-client.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function displayName(row) {
  const first = row?.first_name ?? row?.firstName ?? '';
  const last = row?.last_name ?? row?.lastName ?? '';
  return `${first} ${last}`.trim() || row?.email || row?.id || '—';
}

export function unitNumber(unit) {
  return unit?.unit_number ?? unit?.unitNumber ?? '—';
}

export function lockSerial(unit) {
  return (
    unit?.blulok_device?.device_serial ??
    unit?.device?.device_serial ??
    unit?.lock_serial ??
    null
  );
}

export function lockStatus(unit) {
  return (
    unit?.lock_status ??
    unit?.blulok_device?.lock_status ??
    unit?.device?.lock_status ??
    '—'
  );
}

export async function resolveFacility(api, term) {
  if (!term) return null;
  if (isUuid(term)) {
    try {
      const res = await api(`/facilities/${term}`);
      return res.facility ?? res;
    } catch {
      return { id: term, name: term };
    }
  }

  const res = await api(`/facilities${buildQuery({ search: term, limit: 20 })}`);
  const list = res.facilities ?? [];
  const q = term.toLowerCase();
  const exact = list.find((f) => String(f.name ?? '').toLowerCase() === q);
  if (exact) return exact;
  if (list.length === 1) return list[0];
  if (!list.length) throw new Error(`No facility matched "${term}"`);
  throw new Error(
    `Ambiguous facility "${term}". Use --facility <uuid>:\n` +
      list
        .slice(0, 8)
        .map((f) => `  - ${f.id}  ${f.name ?? ''}`)
        .join('\n'),
  );
}

export async function fetchUsers(api, { facilityId, search, role, limit = 50 } = {}) {
  const res = await api(
    `/users${buildQuery({
      facility_id: facilityId,
      search,
      role,
      limit,
    })}`,
  );
  return {
    users: res.users ?? res.data ?? [],
    total: res.total ?? res.pagination?.total ?? (res.users ?? res.data ?? []).length,
  };
}

export async function fetchFacilities(api, { search, status, limit = 50 } = {}) {
  const res = await api(`/facilities${buildQuery({ search, status, limit })}`);
  return { facilities: res.facilities ?? [], total: res.total ?? (res.facilities ?? []).length };
}

export async function fetchUnits(api, { facilityId, search, status, lockStatus, limit = 100 } = {}) {
  const res = await api(
    `/units${buildQuery({
      facility_id: facilityId,
      search,
      status,
      lock_status: lockStatus,
      limit,
    })}`,
  );
  return { units: res.units ?? [], total: res.total ?? (res.units ?? []).length };
}

export async function fetchDevices(
  api,
  { facilityId, search, status, deviceType, unassigned = false, limit = 100 } = {},
) {
  const path = unassigned ? '/devices/unassigned' : '/devices';
  const res = await api(
    `${path}${buildQuery({
      facility_id: facilityId,
      search,
      status,
      device_type: deviceType,
      device_scope: 'operational',
      limit,
    })}`,
  );
  return { devices: res.devices ?? [], total: res.total ?? (res.devices ?? []).length };
}

export async function fetchGateways(api, { facilityId } = {}) {
  const res = await api('/gateways');
  let gateways = res.gateways ?? [];
  if (facilityId) gateways = gateways.filter((g) => g.facility_id === facilityId);
  return { gateways, total: gateways.length };
}

export function summarizeFmsConfig(cfg) {
  if (!cfg) return null;
  const sync = cfg.config?.syncSettings ?? {};
  const features = cfg.config?.features ?? {};
  return {
    id: cfg.id,
    facility_id: cfg.facility_id,
    facility_name: cfg.facility_name ?? cfg.facility?.name,
    provider_type: cfg.provider_type,
    is_enabled: cfg.is_enabled,
    supports_webhooks: features.supportsWebhooks ?? null,
    webhook_auth_mode: sync.webhookAuthMode ?? null,
    last_sync_at: cfg.last_sync_at ?? cfg.lastSyncAt ?? null,
    last_sync_status: cfg.last_sync_status ?? cfg.lastSyncStatus ?? null,
  };
}

export async function fetchFmsConfigs(api, { facilityId } = {}) {
  if (facilityId) {
    try {
      const res = await api(`/fms/config/${facilityId}`);
      const cfg = res.config ?? res;
      return { configs: cfg ? [summarizeFmsConfig(cfg)] : [], total: cfg ? 1 : 0 };
    } catch (err) {
      if (String(err.message ?? err).includes('404')) return { configs: [], total: 0 };
      throw err;
    }
  }
  const res = await api('/fms/config');
  const configs = (res.configs ?? []).map(summarizeFmsConfig);
  return { configs, total: configs.length };
}

export async function fetchFmsSyncHistory(api, facilityId, { limit = 10 } = {}) {
  const res = await api(`/fms/sync/${facilityId}/history${buildQuery({ limit })}`);
  return { logs: res.logs ?? res.data ?? [], total: res.total ?? (res.logs ?? []).length };
}

export async function fetchFmsWebhookEvents(api, facilityId, { limit = 10 } = {}) {
  const res = await api(`/fms/webhooks/${facilityId}/events${buildQuery({ limit })}`);
  return { events: res.events ?? [], total: (res.events ?? []).length };
}

export async function fetchKeyShares(api, { unitId, userId, limit = 50 } = {}) {
  const res = await api(
    `/key-sharing${buildQuery({
      unit_id: unitId,
      shared_with_user_id: userId,
      primary_tenant_id: undefined,
      is_active: true,
      limit,
    })}`,
  );
  return {
    shares: res.shares ?? res.data ?? res.keyShares ?? [],
    total: res.total ?? (res.shares ?? res.data ?? res.keyShares ?? []).length,
  };
}

export async function fetchWsStatus(api, facilityId) {
  return api(`/gateways/status/${facilityId}`);
}

export function analyzeFacilityInventory({
  facility,
  users,
  units,
  locks,
  accessControl,
  unassigned,
  gateways,
  wsStatus,
  fms,
  syncLogs,
} = {}) {
  const findings = [];
  const unitList = units ?? [];
  const lockList = locks ?? [];
  const gwList = gateways ?? [];

  if (!gwList.length) {
    findings.push({
      severity: 'warning',
      code: 'no_gateway',
      message: 'No gateway assigned to this facility.',
    });
  }

  const connected = wsStatus?.connected ?? wsStatus?.isConnected;
  if (connected === false) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'gateway_disconnected',
      message: 'Gateway WebSocket is not connected.',
    });
  }

  const unitsNoLock = unitList.filter((u) => !lockSerial(u));
  if (unitsNoLock.length) {
    findings.push({
      severity: 'warning',
      code: 'units_without_lock',
      message: `${unitsNoLock.length} unit(s) have no BluLok: ${unitsNoLock
        .slice(0, 8)
        .map((u) => unitNumber(u))
        .join(', ')}${unitsNoLock.length > 8 ? '…' : ''}`,
    });
  }

  if (unassigned?.length) {
    findings.push({
      severity: 'info',
      code: 'unassigned_locks',
      message: `${unassigned.length} unassigned BluLok(s) at this facility.`,
    });
  }

  if (!fms) {
    findings.push({
      severity: 'info',
      code: 'no_fms',
      message: 'No FMS configuration for this facility.',
    });
  } else if (fms.is_enabled === false) {
    findings.push({
      severity: 'warning',
      code: 'fms_disabled',
      message: `FMS ${fms.provider_type ?? 'config'} is disabled.`,
    });
  }

  const latestSync = syncLogs?.[0];
  const syncStatus = String(latestSync?.status ?? latestSync?.sync_status ?? '').toLowerCase();
  if (latestSync && (syncStatus.includes('fail') || syncStatus.includes('error'))) {
    findings.push({
      severity: 'warning',
      code: 'fms_sync_failed',
      message: `Latest FMS sync ${latestSync.id ?? ''} is ${latestSync.status ?? latestSync.sync_status}.`,
    });
  }

  const tenants = (users ?? []).filter((u) => String(u.role).toLowerCase() === 'tenant');
  if (facility && tenants.length === 0 && unitList.length) {
    findings.push({
      severity: 'info',
      code: 'no_tenants_listed',
      message: 'Units exist but no tenant users matched the facility filter.',
    });
  }

  void lockList;
  void accessControl;
  return findings;
}
