import { get, post, put, del } from './httpClient';
import type { DeviceGroup } from '@/types/facility.types';
import type { GroupUserAccess } from '@/components/AccessCodes/access-groups.utils';

export async function getDeviceGroups(facilityId: string, groupType?: 'zone' | 'access_code') {
  return get<{ success: boolean; data: DeviceGroup[] }>('/device-groups', {
    params: {
      facility_id: facilityId,
      group_type: groupType,
    },
  });
}

export async function createDeviceGroup(payload: {
  facility_id: string;
  group_type?: 'zone' | 'access_code';
  is_default?: boolean;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return post<{ success: boolean; data: DeviceGroup }>('/device-groups', payload);
}

export async function updateDeviceGroup(groupId: string, payload: {
  group_type?: 'zone' | 'access_code';
  is_default?: boolean;
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}) {
  return put<{ success: boolean; data: DeviceGroup }>(`/device-groups/${groupId}`, payload);
}

export async function getDeviceGroup(groupId: string) {
  return get<{
    success: boolean;
    data: DeviceGroup & {
      members?: Array<{
        id: string;
        group_id: string;
        device_id: string;
        device_type?: 'access_control' | 'blulok';
        source_unit_id?: string | null;
      }>;
    };
  }>(`/device-groups/${groupId}`);
}

export async function getDeviceGroupUsers(groupId: string) {
  return get<{
    success: boolean;
    data: GroupUserAccess[];
  }>(`/device-groups/${groupId}/users`);
}

export async function deleteDeviceGroup(groupId: string) {
  return del<{ success: boolean }>(`/device-groups/${groupId}`);
}

export async function addDeviceGroupMember(
  groupId: string,
  payload: {
    deviceId?: string;
    unitId?: string;
    deviceType: 'access_control' | 'blulok';
  },
) {
  return post(`/device-groups/${groupId}/members`, {
    device_id: payload.deviceId,
    unit_id: payload.unitId,
    device_type: payload.deviceType,
  });
}

export async function removeDeviceGroupMember(groupId: string, deviceId: string, deviceType?: 'access_control' | 'blulok') {
  return del(`/device-groups/${groupId}/members/${deviceId}`, {
    params: deviceType ? { device_type: deviceType } : undefined,
  });
}
