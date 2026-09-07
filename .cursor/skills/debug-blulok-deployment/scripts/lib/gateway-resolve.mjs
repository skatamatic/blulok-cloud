import { buildQuery } from './api-client.mjs';

export async function listFacilityGateways(api, facilityId) {
  if (!facilityId) return [];
  const list = await api('/gateways');
  return (list.gateways ?? []).filter((g) => g.facility_id === facilityId);
}

export async function fetchDeviceGatewayId(api, deviceId) {
  if (!deviceId) return null;
  try {
    const res = await api(`/devices/blulok/${deviceId}`);
    return res.device?.gateway_id ?? res.gateway_id ?? null;
  } catch {
    return null;
  }
}

export function pickGateway(gateways, { preferredId } = {}) {
  if (!gateways?.length) return null;
  if (preferredId) {
    const match = gateways.find((g) => g.id === preferredId);
    if (match) return match;
  }
  const ranked = [...gateways].sort((a, b) => {
    const aOnline = a.status === 'online' ? 0 : 1;
    const bOnline = b.status === 'online' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return new Date(b.last_seen ?? 0) - new Date(a.last_seen ?? 0);
  });
  return ranked[0];
}

export async function resolveFacilityGateways(api, {
  facilityId,
  preferredGatewayId,
  deviceId,
} = {}) {
  const gateways = await listFacilityGateways(api, facilityId);
  const deviceGatewayId = preferredGatewayId
    ? null
    : await fetchDeviceGatewayId(api, deviceId);
  const preferredId = preferredGatewayId ?? deviceGatewayId;
  const gateway = pickGateway(gateways, { preferredId });
  return {
    gateways,
    gateway,
    preferredId,
    deviceGatewayId,
    multiGateway: gateways.length > 1,
  };
}

export async function fetchTelemetryForGateways(api, gatewayIds, query = {}) {
  const results = [];
  for (const id of gatewayIds) {
    try {
      const res = await api(`/gateways/${id}/telemetry-logs${buildQuery(query)}`);
      results.push({
        gatewayId: id,
        logs: (res.logs ?? []).map((log) => ({ ...log, _gateway_id: id })),
        total: res.total ?? 0,
      });
    } catch (err) {
      results.push({ gatewayId: id, error: String(err.message ?? err), logs: [], total: 0 });
    }
  }
  const logs = results
    .flatMap((r) => r.logs)
    .sort((a, b) => new Date(b.logged_at ?? 0) - new Date(a.logged_at ?? 0));
  return {
    byGateway: results,
    logs,
    total: results.reduce((sum, r) => sum + (r.total || 0), 0),
  };
}
