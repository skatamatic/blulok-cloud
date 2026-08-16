import { get, post, put } from './httpClient';
import type { AccessCode, AccessCodeConfig, AccessCodeGroupConfig, EffectiveAccessCode, UserAccessCode } from '@/types/facility.types';

export async function getAccessCodeConfig(facilityId: string) {
  return get<{ success: boolean; data: AccessCodeConfig }>(`/access-codes/config/${facilityId}`);
}

export async function updateAccessCodeConfig(facilityId: string, payload: Partial<AccessCodeConfig>) {
  return put<{ success: boolean; data: AccessCodeConfig }>(`/access-codes/config/${facilityId}`, payload);
}

export async function getAccessCodePushState(facilityId: string) {
  return get<{
    success: boolean;
    data: {
      facility_id: string;
      status: 'pending' | 'active' | 'error';
      last_error: string | null;
      last_nonce: string | null;
      updated_at: string;
    };
  }>(`/access-codes/push-state/${facilityId}`);
}

export async function getAccessCodeGroupConfig(groupId: string) {
  return get<{ success: boolean; data: AccessCodeGroupConfig }>(`/access-codes/groups/${groupId}/config`);
}

export async function updateAccessCodeGroupConfig(groupId: string, payload: Partial<AccessCodeGroupConfig>) {
  return put<{ success: boolean; data: AccessCodeGroupConfig }>(`/access-codes/groups/${groupId}/config`, payload);
}

export async function getAccessCodes(facilityId: string, scheduleId?: string | null) {
  return get<{ success: boolean; data: AccessCode[] }>('/access-codes', {
    params: {
      facility_id: facilityId,
      schedule_id: scheduleId === undefined ? undefined : scheduleId,
    },
  });
}

export async function getEffectiveAccessCodes(facilityId: string, scheduleId?: string | null) {
  return get<{ success: boolean; data: EffectiveAccessCode[] }>('/access-codes/effective', {
    params: {
      facility_id: facilityId,
      schedule_id: scheduleId === undefined ? undefined : scheduleId,
    },
  });
}

export async function rotateAccessCodes(payload: {
  facility_id: string;
  scope_type?: 'device_group' | 'device';
  scope_id?: string | null;
  schedule_id?: string | null;
}) {
  return post('/access-codes/rotate', payload);
}

export async function setManualAccessCode(payload: {
  facility_id: string;
  scope_type: 'device_group' | 'device';
  scope_id?: string | null;
  code: string;
  schedule_id?: string | null;
}) {
  return put('/access-codes/manual/set', payload);
}

export async function pushAccessCodesToGateway(facilityId: string) {
  return post(`/access-codes/push/${facilityId}`, {});
}

export async function getMyAccessCodes(facilityId?: string) {
  return get<{ success: boolean; data: UserAccessCode[] }>('/access-codes/my', {
    params: facilityId ? { facility_id: facilityId } : undefined,
  });
}

export async function getAppAccessCodes(facilityId?: string) {
  return get<{ success: boolean; data: UserAccessCode[] }>('/access-codes/app/my', {
    params: facilityId ? { facility_id: facilityId } : undefined,
  });
}
