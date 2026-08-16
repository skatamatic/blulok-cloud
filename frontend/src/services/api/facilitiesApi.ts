import { get, post, put, del } from './httpClient';

export async function getFacilities(filters?: object) {
  return get('/facilities', { params: filters });
}

export async function getFacility(id: string) {
  return get(`/facilities/${id}`);
}

export async function createFacility(data: object | FormData) {
  return post('/facilities', data);
}

export async function updateFacility(id: string, data: object | FormData) {
  return put(`/facilities/${id}`, data);
}

export async function deleteFacility(id: string) {
  return del(`/facilities/${id}`);
}

export async function getFacilityDeleteImpact(id: string) {
  return get(`/facilities/${id}/delete-impact`);
}

export async function getFacilitySchedules(facilityId: string) {
  return get(`/facilities/${facilityId}/schedules`);
}

export async function getSchedule(facilityId: string, scheduleId: string) {
  return get(`/facilities/${facilityId}/schedules/${scheduleId}`);
}

export async function createSchedule(facilityId: string, data: object) {
  return post(`/facilities/${facilityId}/schedules`, data);
}

export async function updateSchedule(facilityId: string, scheduleId: string, data: object) {
  return put(`/facilities/${facilityId}/schedules/${scheduleId}`, data);
}

export async function getScheduleUsage(facilityId: string, scheduleId: string) {
  return get(`/facilities/${facilityId}/schedules/${scheduleId}/usage`);
}

export async function deleteSchedule(facilityId: string, scheduleId: string) {
  return del(`/facilities/${facilityId}/schedules/${scheduleId}`);
}

export async function listFacilityProvisioningFiles(facilityId: string, limit = 50, offset = 0) {
  const params: Record<string, string> = {};
  if (limit !== 50) params.limit = String(limit);
  if (offset > 0) params.offset = String(offset);
  return get(`/facilities/${facilityId}/provisioning-data`, { params });
}

export async function prepareFacilityProvisioningUpload(
  facilityId: string,
  body: { filename: string; size_bytes: number; content_type?: string },
) {
  return post(`/facilities/${facilityId}/provisioning-data/prepare`, body);
}

export async function completeFacilityProvisioningUpload(
  facilityId: string,
  body: { upload_id: string; filename: string; size_bytes: number; content_type?: string },
) {
  return post(`/facilities/${facilityId}/provisioning-data/complete`, body);
}

export async function deleteFacilityProvisioningFile(facilityId: string, fileId: string) {
  return del(`/facilities/${facilityId}/provisioning-data/${fileId}`);
}

export function getFacilityProvisioningDownloadPath(facilityId: string, fileId: string): string {
  return `/facilities/${facilityId}/provisioning-data/${fileId}/download`;
}
