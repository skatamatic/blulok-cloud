import { get } from './httpClient';

export async function getAccessHistory(filters?: {
  user_id?: string;
  facility_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  success?: boolean;
  search?: string;
  view?: 'sessions' | 'raw';
  state?: string;
}) {
  return get('/access-history', { params: filters });
}

export async function getAccessSessions(filters?: {
  user_id?: string;
  facility_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  success?: boolean;
  state?: string;
}) {
  return get('/access-sessions', { params: filters });
}

export async function getAccessSessionById(id: string) {
  return get(`/access-sessions/${id}`);
}

export async function exportAccessSessions(filters?: {
  user_id?: string;
  facility_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  state?: string;
}) {
  return get('/access-sessions/export', {
    params: filters,
    responseType: 'blob',
  });
}

export async function getUserAccessHistory(userId: string, filters?: {
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  return get(`/access-history/user/${userId}`, { params: filters });
}

export async function getFacilityAccessHistory(facilityId: string, filters?: {
  user_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  success?: boolean;
  search?: string;
  view?: 'sessions' | 'raw';
  state?: string;
}) {
  return get(`/access-history/facility/${facilityId}`, { params: filters });
}

export async function getUnitAccessHistory(unitId: string, filters?: {
  user_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  success?: boolean;
  search?: string;
  view?: 'sessions' | 'raw';
  state?: string;
}) {
  return get(`/access-history/unit/${unitId}`, { params: filters });
}

export async function getAccessLogById(id: string) {
  return get(`/access-history/${id}`);
}

export async function getAccessHistoryById(id: string, options?: { view?: 'sessions' | 'raw' }) {
  if (options?.view === 'raw') {
    return getAccessLogById(id);
  }
  return getAccessSessionById(id);
}

export async function exportAccessHistory(filters?: {
  user_id?: string;
  facility_id?: string;
  unit_id?: string;
  action?: string;
  method?: string;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  view?: 'sessions' | 'raw';
  state?: string;
}) {
  return get('/access-history/export', {
    params: filters,
    responseType: 'blob'
  });
}

export async function getActivityStats(options?: {
  period?: 'day' | 'week' | 'month' | 'year';
  facility_ids?: string[];
}) {
  const params: Record<string, unknown> = {};
  if (options?.period) {
    params.period = options.period;
  }
  if (options?.facility_ids && options.facility_ids.length > 0) {
    params.facility_ids = options.facility_ids;
  }
  return get('/access-history/stats/activity', { params });
}
