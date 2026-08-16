import { get, post, put, del } from './httpClient';
import type {
  AccessControlDevice,
  CreateAccessControlDevicePayload,
  UpdateAccessControlDevicePayload,
  UpdateAccessControlDeviceMetadataPayload,
  UpdateBluLokDeviceMetadataPayload,
  DeviceMetadataSideEffects,
} from '@/types/facility.types';

export async function getDevices(filters?: object) {
  return get('/devices', { params: filters });
}

export async function getBluLokDevice(id: string) {
  return get(`/devices/blulok/${id}`);
}

export async function getAccessControlDevice(id: string): Promise<{ success: boolean; device: AccessControlDevice }> {
  return get(`/devices/access-control/${id}`);
}

export async function getFacilityDeviceHierarchy(facilityId: string) {
  return get(`/devices/facility/${facilityId}/hierarchy`);
}

export async function getDeviceDenylist(deviceId: string) {
  return get(`/devices/blulok/${deviceId}/denylist`);
}

export async function pruneDenylist() {
  return post('/denylist/prune');
}

export async function getUserRoutePassHistory(userId: string, filters?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}) {
  const params: Record<string, number | string> = {};
  if (filters?.limit) params.limit = filters.limit;
  if (filters?.offset) params.offset = filters.offset;
  if (filters?.startDate) params.startDate = filters.startDate;
  if (filters?.endDate) params.endDate = filters.endDate;
  return get(`/route-passes/users/${userId}`, { params });
}

export async function createAccessControlDevice(data: CreateAccessControlDevicePayload) {
  return post('/devices/access-control', data);
}

export async function updateAccessControlDevice(id: string, data: UpdateAccessControlDevicePayload) {
  return put(`/devices/access-control/${id}`, data);
}

export async function updateAccessControlDeviceMetadata(
  id: string,
  data: UpdateAccessControlDeviceMetadataPayload
) {
  return put<{
    success: boolean;
    device: unknown;
    sideEffects?: DeviceMetadataSideEffects;
  }>(`/devices/access-control/${id}/metadata`, data);
}

export async function updateBluLokDeviceMetadata(
  id: string,
  data: UpdateBluLokDeviceMetadataPayload
) {
  return put<{
    success: boolean;
    device: unknown;
    sideEffects?: DeviceMetadataSideEffects;
  }>(`/devices/blulok/${id}/metadata`, data);
}

export async function createBluLokDevice(data: object) {
  return post('/devices/blulok', data);
}

export async function updateDeviceStatus(deviceType: string, id: string, status: string) {
  return put(`/devices/${deviceType}/${id}/status`, { status });
}

export async function updateLockStatus(
  id: string,
  lock_status: string,
  tenantOverride?: { reason: string; notes?: string },
) {
  const body: {
    lock_status: string;
    tenant_override_reason?: string;
    tenant_override_notes?: string;
  } = { lock_status };
  if (tenantOverride?.reason) {
    body.tenant_override_reason = tenantOverride.reason;
    if (tenantOverride.notes) {
      body.tenant_override_notes = tenantOverride.notes;
    }
  }
  return put(`/devices/blulok/${id}/lock`, body);
}

export async function updateAccessControlLockStatus(
  id: string,
  lock_status: string,
  options?: { open_until?: number },
) {
  const body: { lock_status: string; open_until?: number } = { lock_status };
  if (options?.open_until != null) {
    body.open_until = options.open_until;
  }
  return put(`/devices/access-control/${id}/lock`, body);
}

export async function getUnassignedDevices(facilityId?: string) {
  const params = facilityId ? { facility_id: facilityId } : {};
  return get('/devices/unassigned', { params });
}

export async function assignDeviceToUnit(deviceId: string, unitId: string) {
  return post(`/devices/blulok/${deviceId}/assign`, { unit_id: unitId });
}

export async function unassignDeviceFromUnit(deviceId: string) {
  return del(`/devices/blulok/${deviceId}/unassign`);
}

export async function removeBluLokDeviceFromCloudInventory(deviceId: string) {
  return del(`/devices/blulok/${deviceId}`);
}

export async function removeAccessControlDeviceFromCloudInventory(deviceId: string) {
  return del(`/devices/access-control/${deviceId}`);
}

export async function removeNetworkInfraDeviceFromCloudInventory(deviceId: string) {
  return del(`/devices/network-infra/${deviceId}`);
}
