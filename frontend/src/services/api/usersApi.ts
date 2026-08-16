import { get, post, put, del } from './httpClient';

export async function getUsers(params?: {
  search?: string;
  role?: string;
  facility?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
}) {
  return get('/users', { params });
}

export async function getUser(id: string) {
  return get(`/users/${id}`);
}

export async function createUser(userData: object) {
  return post('/users', userData);
}

export async function updateUser(id: string, userData: object) {
  return put(`/users/${id}`, userData);
}

export async function deactivateUser(id: string) {
  return del(`/users/${id}`);
}

export async function activateUser(id: string) {
  return post(`/users/${id}/activate`);
}

export async function getUserDetails(id: string) {
  return get(`/users/${id}/details`);
}

export async function deleteUserDevice(deviceId: string) {
  return del(`/user-devices/admin/${deviceId}`);
}

export async function getUserFacilities(userId: string) {
  return get(`/user-facilities/${userId}`);
}

export async function setUserFacilities(userId: string, facilityIds: string[]) {
  return put(`/user-facilities/${userId}`, { facilityIds });
}

export async function addUserToFacility(userId: string, facilityId: string) {
  return post(`/user-facilities/${userId}/facilities/${facilityId}`);
}

export async function removeUserFromFacility(userId: string, facilityId: string) {
  return del(`/user-facilities/${userId}/facilities/${facilityId}`);
}

export async function resendUserInvite(userId: string) {
  return post<{
    success: boolean;
    message: string;
    inviteSent?: boolean;
    inviteWarning?: string;
  }>(`/users/${userId}/resend-invite`);
}

export async function resetUserAccount(userId: string) {
  return post<{
    success: boolean;
    message: string;
    devicesRevoked?: number;
    inviteSent?: boolean;
    inviteWarning?: string;
  }>(`/users/${userId}/reset-account`);
}

export async function getUserScheduleForFacility(userId: string, facilityId: string) {
  return get(`/users/${userId}/facilities/${facilityId}/schedule`);
}

export async function setUserScheduleForFacility(userId: string, facilityId: string, scheduleId: string) {
  return put(`/users/${userId}/facilities/${facilityId}/schedule`, {
    scheduleId,
  });
}
