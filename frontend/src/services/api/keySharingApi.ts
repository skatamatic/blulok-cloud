import { get, post, put, del } from './httpClient';

export async function getKeySharing(filters?: {
  unit_id?: string;
  primary_tenant_id?: string;
  shared_with_user_id?: string;
  access_level?: string;
  is_active?: boolean;
  expires_before?: string;
  limit?: number;
  offset?: number;
}) {
  return get('/key-sharing', { params: filters });
}

export async function getUserKeySharing(userId: string, filters?: {
  access_level?: string;
  is_active?: boolean;
  expires_before?: string;
  limit?: number;
  offset?: number;
}) {
  return get(`/key-sharing/user/${userId}`, { params: filters });
}

export async function getUnitKeySharing(unitId: string, filters?: {
  access_level?: string;
  is_active?: boolean;
  expires_before?: string;
  limit?: number;
  offset?: number;
}) {
  return get(`/key-sharing/unit/${unitId}`, { params: filters });
}

export async function createKeySharing(data: {
  unit_id: string;
  shared_with_user_id: string;
  access_level: 'full' | 'limited' | 'temporary' | 'permanent';
  expires_at?: string;
  notes?: string;
  access_restrictions?: Record<string, unknown>;
}) {
  return post('/key-sharing', data);
}

export async function updateKeySharing(id: string, data: {
  access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
  expires_at?: string;
  notes?: string;
  access_restrictions?: Record<string, unknown>;
  is_active?: boolean;
}) {
  return put(`/key-sharing/${id}`, data);
}

export async function revokeKeySharing(id: string) {
  return del(`/key-sharing/${id}`);
}

export async function getExpiredKeySharing() {
  return get('/key-sharing/admin/expired');
}

export async function inviteSharedKey(data: {
  unit_id: string;
  phone: string;
  access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
  expires_at?: string;
}) {
  return post('/key-sharing/invite', data);
}
