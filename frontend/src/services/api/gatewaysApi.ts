import { get, post, put, del } from './httpClient';
import type { GatewayDeviceSyncLogsResponse, GatewayTelemetryLogsResponse, GatewayTelemetryLogFilters } from '@/types/gateway.types';
import type { AccessSessionTraceResponse } from '@/types/access-session-trace.types';

export async function createGateway(data: object) {
  return post('/gateways', data);
}

export async function getGateways(filters?: object) {
  return get('/gateways', { params: filters });
}

export async function getGateway(id: string) {
  return get(`/gateways/${id}`);
}

export async function updateGateway(id: string, data: object) {
  return put(`/gateways/${id}`, data);
}

export async function releaseGateway(id: string) {
  return post(`/gateways/${id}/release`);
}

export async function updateGatewayStatus(id: string, status: string) {
  return put(`/gateways/${id}/status`, { status });
}

export async function deleteGateway(id: string) {
  return del(`/gateways/${id}`);
}

export async function testGatewayConnection(id: string) {
  return post(`/gateways/${id}/test-connection`);
}

export async function syncGateway(id: string) {
  return post(`/gateways/${id}/sync`);
}

export async function getGatewayDeviceSyncLogs(
  gatewayId: string,
  params?: { limit?: number; offset?: number }
): Promise<GatewayDeviceSyncLogsResponse> {
  return get(`/gateways/${gatewayId}/device-sync-logs`, { params });
}

export async function getGatewayTelemetryLogs(
  gatewayId: string,
  params?: GatewayTelemetryLogFilters & { limit?: number; offset?: number }
): Promise<GatewayTelemetryLogsResponse> {
  return get(`/gateways/${gatewayId}/telemetry-logs`, { params });
}

export async function getGatewaySessionTrace(
  gatewayId: string,
  params?: { user_id?: string; device_id?: string; unit_id?: string }
): Promise<AccessSessionTraceResponse> {
  return get(`/gateways/${gatewayId}/session-trace`, { params });
}

export async function getGatewayWsStatus(facilityId: string) {
  return get<{ success: boolean; facilityId: string; connected: boolean; lastPongAt?: number }>(`/gateways/status/${facilityId}`);
}

export async function getCommandQueue(params?: { status?: string; limit?: number; offset?: number }) {
  return get('/commands/pending', { params });
}

export async function retryCommand(id: string) {
  return post(`/commands/${id}/retry`);
}

export async function cancelCommand(id: string) {
  return post(`/commands/${id}/cancel`);
}

export async function requeueDeadCommand(id: string) {
  return post(`/commands/${id}/requeue-dead`);
}

export async function getCommandAttempts(id: string) {
  return get(`/commands/${id}/attempts`);
}

export async function getGatewayRecoveryStatus(gatewayId: string) {
  return get(`/gateways/${gatewayId}/recovery/status`);
}

export async function getGatewayRecoveryCandidates(facilityId: string) {
  return get(`/gateways/facility/${facilityId}/recovery/candidates`);
}

export async function getGatewayRecoveryInventoryPreview(gatewayId: string) {
  return get(`/gateways/${gatewayId}/recovery/inventory-preview`);
}

export async function initiateGatewayRecovery(
  gatewayId: string,
  body?: { firmwareId?: string; includeFirmware?: boolean; firmwareDeliveryMode?: 'v1' | 'v2' },
) {
  return post(`/gateways/${gatewayId}/recovery/initiate`, body || {});
}

export async function bypassGatewayRecovery(gatewayId: string, confirm: boolean) {
  return post(`/gateways/${gatewayId}/recovery/bypass`, { confirm });
}

export async function cancelGatewayRecovery(gatewayId: string, recoveryId: string) {
  return post(`/gateways/${gatewayId}/recovery/${recoveryId}/cancel`, {});
}

export async function getGatewayRecoveryOptions(gatewayId: string) {
  return get(`/gateways/${gatewayId}/recovery/options`);
}

export async function retryGatewayRecovery(gatewayId: string) {
  return post(`/gateways/${gatewayId}/recovery/retry`, {});
}

export async function getGatewayRecoveryEvents(gatewayId: string, recoveryId: string, limit = 100) {
  return get(`/gateways/${gatewayId}/recovery/${recoveryId}/events`, {
    params: { limit },
  });
}
