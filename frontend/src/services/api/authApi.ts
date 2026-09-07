import { get, post } from './httpClient';
import { LoginCredentials, LoginResponse } from '@/types/auth.types';
import type { ScopedGeneralStatsData } from '@/types/dashboard.types';

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return post('/auth/login', credentials);
}

export async function logout(): Promise<void> {
  await post('/auth/logout');
}

export async function getProfile() {
  return get('/auth/profile');
}

export async function getDashboardGeneralStats(params?: {
  facility_id?: string;
}): Promise<{ success: boolean; data: ScopedGeneralStatsData }> {
  return get('/dashboard/general-stats', {
    params: params?.facility_id ? { facility_id: params.facility_id } : undefined,
  });
}

export async function verifyToken() {
  return get('/auth/verify-token');
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return post('/auth/change-password', {
    currentPassword,
    newPassword,
  });
}
