import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from './appConfig';
import { LoginCredentials, LoginResponse } from '@/types/auth.types';
import { AccessCode, AccessCodeConfig, AccessCodeGroupConfig, DeviceGroup, EffectiveAccessCode, UserAccessCode, AccessControlDevice, CreateAccessControlDevicePayload, UpdateAccessControlDevicePayload } from '@/types/facility.types';
import type { ScopedGeneralStatsData } from '@/types/dashboard.types';
import type { UserNotificationApi } from '@/types/notifications.types';

// Safe access to import.meta for Jest compatibility
const API_BASE_URL = getApiBaseUrl();

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: `${API_BASE_URL}/api/v1`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle auth errors
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await this.api.post('/auth/login', credentials);
    return response.data;
  }

  async logout(): Promise<void> {
    await this.api.post('/auth/logout');
  }

  async getProfile() {
    const response = await this.api.get('/auth/profile');
    return response.data;
  }

  /** Initial dashboard stats (same payload as WebSocket `general_stats_update`) */
  async getDashboardGeneralStats(params?: {
    /** When set, server limits counts to this facility (RBAC enforced) */
    facility_id?: string;
  }): Promise<{ success: boolean; data: ScopedGeneralStatsData }> {
    const response = await this.api.get('/dashboard/general-stats', {
      params: params?.facility_id ? { facility_id: params.facility_id } : undefined,
    });
    return response.data;
  }

  async verifyToken() {
    const response = await this.api.get('/auth/verify-token');
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  // User management endpoints
  async getUsers(params?: {
    search?: string;
    role?: string;
    facility?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get('/users', { params });
    return response.data;
  }

  async getUser(id: string) {
    const response = await this.api.get(`/users/${id}`);
    return response.data;
  }

  async createUser(userData: object) {
    const response = await this.api.post('/users', userData);
    return response.data;
  }

  async updateUser(id: string, userData: object) {
    const response = await this.api.put(`/users/${id}`, userData);
    return response.data;
  }

  async deactivateUser(id: string) {
    const response = await this.api.delete(`/users/${id}`);
    return response.data;
  }

  async activateUser(id: string) {
    const response = await this.api.post(`/users/${id}/activate`);
    return response.data;
  }

  async getUserDetails(id: string) {
    const response = await this.api.get(`/users/${id}/details`);
    return response.data;
  }

  async deleteUserDevice(deviceId: string) {
    const response = await this.api.delete(`/user-devices/admin/${deviceId}`);
    return response.data;
  }

  // User facility management endpoints
  async getUserFacilities(userId: string) {
    const response = await this.api.get(`/user-facilities/${userId}`);
    return response.data;
  }

  async setUserFacilities(userId: string, facilityIds: string[]) {
    const response = await this.api.put(`/user-facilities/${userId}`, { facilityIds });
    return response.data;
  }

  async addUserToFacility(userId: string, facilityId: string) {
    const response = await this.api.post(`/user-facilities/${userId}/facilities/${facilityId}`);
    return response.data;
  }

  async removeUserFromFacility(userId: string, facilityId: string) {
    const response = await this.api.delete(`/user-facilities/${userId}/facilities/${facilityId}`);
    return response.data;
  }

  // Widget layout endpoints
  async getWidgetLayouts(activeFacilityId?: string | null) {
    const response = await this.api.get('/widget-layouts', {
      params: activeFacilityId ? { activeFacilityId } : undefined,
    });
    return response.data;
  }

  async saveWidgetLayouts(layouts: Array<{
    widgetId: string;
    widgetType?: string;
    config?: Record<string, unknown>;
    layoutConfig: unknown;
    displayOrder: number;
    isVisible?: boolean;
  }>) {
    const response = await this.api.post('/widget-layouts', { layouts });
    return response.data;
  }

  async saveDashboard(pages: Array<{
    id?: string;
    name?: string;
    pageOrder: number;
    widgets: Array<{
      widgetId: string;
      widgetType?: string;
      config?: Record<string, unknown>;
      layoutConfig: unknown;
      displayOrder: number;
      isVisible?: boolean;
    }>;
  }>, activePageId?: string) {
    const response = await this.api.post('/widget-layouts', { pages, activePageId });
    return response.data;
  }

  async updateWidget(
    widgetId: string,
    data: {
      layoutConfig?: unknown;
      isVisible?: boolean;
      displayOrder?: number;
    },
    pageId?: string
  ) {
    const response = await this.api.put(`/widget-layouts/${widgetId}`, data, {
      params: pageId ? { pageId } : undefined,
    });
    return response.data;
  }

  async hideWidget(widgetId: string, pageId?: string) {
    const response = await this.api.delete(`/widget-layouts/${widgetId}`, {
      params: pageId ? { pageId } : undefined,
    });
    return response.data;
  }

  async showWidget(widgetId: string) {
    const response = await this.api.post(`/widget-layouts/${widgetId}/show`);
    return response.data;
  }

  async resetWidgetLayout(activeFacilityId?: string | null) {
    const response = await this.api.post('/widget-layouts/reset', {
      activeFacilityId: activeFacilityId ?? undefined,
    });
    return response.data;
  }

  async resetWidgetLayoutDefaults() {
    const response = await this.api.post('/widget-layouts/reset-defaults');
    return response.data;
  }

  async getWidgetTemplates() {
    const response = await this.api.get('/widget-layouts/templates');
    return response.data;
  }

  async listSavedDashboards() {
    const response = await this.api.get('/saved-dashboards');
    return response.data;
  }

  async createSavedDashboard(payload: { name: string; description?: string }) {
    const response = await this.api.post('/saved-dashboards', payload);
    return response.data;
  }

  async updateSavedDashboardSnapshot(id: string) {
    const response = await this.api.put(`/saved-dashboards/${id}/snapshot`);
    return response.data;
  }

  async renameSavedDashboard(
    id: string,
    payload: { name?: string; description?: string | null }
  ) {
    const response = await this.api.patch(`/saved-dashboards/${id}`, payload);
    return response.data;
  }

  async deleteSavedDashboard(id: string) {
    const response = await this.api.delete(`/saved-dashboards/${id}`);
    return response.data;
  }

  async loadSavedDashboard(id: string, activeFacilityId?: string | null) {
    const response = await this.api.post(`/saved-dashboards/${id}/load`, {
      activeFacilityId: activeFacilityId ?? undefined,
    });
    return response.data;
  }

  async listDashboardAssignments() {
    const response = await this.api.get('/dashboard-assignments');
    return response.data;
  }

  async createDashboardAssignment(payload: {
    savedDashboardId: string;
    scope: 'global' | 'facility' | 'user';
    facilityId?: string | null;
    userId?: string | null;
    targetRole: string;
    priority?: number;
  }) {
    const response = await this.api.post('/dashboard-assignments', payload);
    return response.data;
  }

  async updateDashboardAssignment(
    id: string,
    payload: { savedDashboardId?: string; priority?: number }
  ) {
    const response = await this.api.patch(`/dashboard-assignments/${id}`, payload);
    return response.data;
  }

  async deleteDashboardAssignment(id: string) {
    const response = await this.api.delete(`/dashboard-assignments/${id}`);
    return response.data;
  }

  async getSystemSettings() {
    const response = await this.api.get('/system-settings');
    return response.data;
  }

  async updateSystemSettings(settings: object) {
    const response = await this.api.put('/system-settings', settings);
    return response.data;
  }

  async getNotificationSettings() {
    const response = await this.api.get('/system-settings/notifications');
    return response.data;
  }

  async updateNotificationSettings(config: object) {
    const response = await this.api.put('/system-settings/notifications', config);
    return response.data;
  }

  async sendTestNotifications(payload?: { toEmail?: string; toPhone?: string; configOverride?: object }) {
    const response = await this.api.post('/system-settings/notifications/test', payload || {});
    return response.data as { success: boolean; message: string; sent?: string[]; errors?: { channel: string; message: string }[]; toEmail?: string; toPhone?: string };
  }

  async resendUserInvite(userId: string) {
    const response = await this.api.post(`/users/${userId}/resend-invite`);
    return response.data;
  }

  // Facilities Management
  async getFacilities(filters?: object) {
    const response = await this.api.get('/facilities', { params: filters });
    return response.data;
  }

  async getFacility(id: string) {
    const response = await this.api.get(`/facilities/${id}`);
    return response.data;
  }

  async createFacility(data: object | FormData) {
    const response = await this.api.post('/facilities', data);
    return response.data;
  }

  async updateFacility(id: string, data: object | FormData) {
    const response = await this.api.put(`/facilities/${id}`, data);
    return response.data;
  }

  async deleteFacility(id: string) {
    const response = await this.api.delete(`/facilities/${id}`);
    return response.data;
  }

  async getFacilityDeleteImpact(id: string) {
    const response = await this.api.get(`/facilities/${id}/delete-impact`);
    return response.data;
  }

  // Schedule Management
  async getFacilitySchedules(facilityId: string) {
    const response = await this.api.get(`/facilities/${facilityId}/schedules`);
    return response.data;
  }

  async getSchedule(facilityId: string, scheduleId: string) {
    const response = await this.api.get(`/facilities/${facilityId}/schedules/${scheduleId}`);
    return response.data;
  }

  async createSchedule(facilityId: string, data: object) {
    const response = await this.api.post(`/facilities/${facilityId}/schedules`, data);
    return response.data;
  }

  async updateSchedule(facilityId: string, scheduleId: string, data: object) {
    const response = await this.api.put(`/facilities/${facilityId}/schedules/${scheduleId}`, data);
    return response.data;
  }

  async getScheduleUsage(facilityId: string, scheduleId: string) {
    const response = await this.api.get(`/facilities/${facilityId}/schedules/${scheduleId}/usage`);
    return response.data;
  }

  async deleteSchedule(facilityId: string, scheduleId: string) {
    const response = await this.api.delete(`/facilities/${facilityId}/schedules/${scheduleId}`);
    return response.data;
  }

  async getUserScheduleForFacility(userId: string, facilityId: string) {
    const response = await this.api.get(`/users/${userId}/facilities/${facilityId}/schedule`);
    return response.data;
  }

  async setUserScheduleForFacility(userId: string, facilityId: string, scheduleId: string) {
    const response = await this.api.put(`/users/${userId}/facilities/${facilityId}/schedule`, {
      scheduleId,
    });
    return response.data;
  }

  async createGateway(data: object) {
    const response = await this.api.post('/gateways', data);
    return response.data;
  }

  async getGateways(filters?: object) {
    const response = await this.api.get('/gateways', { params: filters });
    return response.data;
  }

  async getGateway(id: string) {
    const response = await this.api.get(`/gateways/${id}`);
    return response.data;
  }

  async updateGateway(id: string, data: object) {
    const response = await this.api.put(`/gateways/${id}`, data);
    return response.data;
  }

  async reassignGateway(id: string, targetFacilityId: string) {
    const response = await this.api.patch(`/gateways/${id}/reassign`, { targetFacilityId });
    return response.data;
  }

  async getGatewayReassignmentCandidates(facilityId: string) {
    const response = await this.api.get(`/gateways/reassignment-candidates/${facilityId}`);
    return response.data as { success: boolean; gateways: unknown[] };
  }

  async updateGatewayStatus(id: string, status: string) {
    const response = await this.api.put(`/gateways/${id}/status`, { status });
    return response.data;
  }

  // Command Queue
  async getCommandQueue(params?: { status?: string; limit?: number; offset?: number }) {
    const response = await this.api.get('/commands/pending', { params });
    return response.data;
  }

  async retryCommand(id: string) {
    const response = await this.api.post(`/commands/${id}/retry`);
    return response.data;
  }

  async cancelCommand(id: string) {
    const response = await this.api.post(`/commands/${id}/cancel`);
    return response.data;
  }

  async requeueDeadCommand(id: string) {
    const response = await this.api.post(`/commands/${id}/requeue-dead`);
    return response.data;
  }

  async getCommandAttempts(id: string) {
    const response = await this.api.get(`/commands/${id}/attempts`);
    return response.data;
  }

  async deleteGateway(id: string) {
    const response = await this.api.delete(`/gateways/${id}`);
    return response.data;
  }

  async testGatewayConnection(id: string) {
    const response = await this.api.post(`/gateways/${id}/test-connection`);
    return response.data;
  }

  async syncGateway(id: string) {
    const response = await this.api.post(`/gateways/${id}/sync`);
    return response.data;
  }

  async getGatewayDeviceSyncLogs(
    gatewayId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ success: boolean; logs: import('@/types/gateway.types').GatewayDeviceSyncLogRecord[]; total: number }> {
    const response = await this.api.get(`/gateways/${gatewayId}/device-sync-logs`, { params });
    return response.data;
  }

  async getGatewayTelemetryLogs(
    gatewayId: string,
    params?: import('@/types/gateway.types').GatewayTelemetryLogFilters & { limit?: number; offset?: number }
  ): Promise<import('@/types/gateway.types').GatewayTelemetryLogsResponse> {
    const response = await this.api.get(`/gateways/${gatewayId}/telemetry-logs`, { params });
    return response.data;
  }

  async getGatewayWsStatus(facilityId: string) {
    const response = await this.api.get(`/gateways/status/${facilityId}`);
    return response.data as { success: boolean; facilityId: string; connected: boolean; lastPongAt?: number };
  }

  // Dev tools: force a single PING to a connected gateway (DEV_ADMIN only)
  async pingGatewayDev(facilityId: string) {
    const response = await this.api.post('/admin/dev-tools/gateway-ping', { facilityId });
    return response.data as { success: boolean; facilityId: string };
  }

  // Internal Gateway endpoints
  async getSecureTimeSyncPacket() {
    const response = await this.api.get('/internal/gateway/time-sync');
    return response.data as { success: boolean; timeSyncJwt: string };
  }

  async requestTimeSyncForLock(lockId: string) {
    const response = await this.api.post('/internal/gateway/request-time-sync', { lock_id: lockId });
    return response.data as { success: boolean; timeSyncJwt: string };
  }

  async requestFallbackPass(fallbackJwt: string) {
    const response = await this.api.post('/internal/gateway/fallback-pass', { fallbackJwt });
    return response.data as { success: boolean; routePass?: string };
  }

  // Admin Ops-Key Rotation relay (DEV_ADMIN)
  async rotateOpsKey(params: { rootPrivateKeyB64: string; customOpsPublicKeyB64?: string }) {
    const response = await this.api.post('/admin/ops-key-rotation/broadcast', {
      root_private_key_b64: params.rootPrivateKeyB64,
      custom_ops_public_key_b64: params.customOpsPublicKeyB64 || undefined,
    });
    return response.data as {
      success: boolean;
      payload: { cmd_type: 'ROTATE_OPERATIONS_KEY'; new_ops_pubkey: string; ts: number };
      signature: string;
      generated_ops_key_pair?: { private_key_b64: string; public_key_b64: string };
    };
  }

  // Dev Tools: Send gateway commands (DENYLIST_ADD/REMOVE, LOCK/UNLOCK)
  async sendGatewayCommand(params: {
    facilityId: string;
    command: 'DENYLIST_ADD' | 'DENYLIST_REMOVE' | 'LOCK' | 'UNLOCK';
    targetDeviceIds: string[];
    userId?: string;
    expirationSeconds?: number;
  }) {
    const response = await this.api.post('/admin/dev-tools/gateway-command', {
      facilityId: params.facilityId,
      command: params.command,
      targetDeviceIds: params.targetDeviceIds,
      userId: params.userId,
      expirationSeconds: params.expirationSeconds,
    });
    return response.data as {
      success: boolean;
      command: string;
      payload?: unknown;
      signature?: string;
      targetDeviceIds?: string[];
    };
  }

  // Devices Management
  async getDevices(filters?: object) {
    const response = await this.api.get('/devices', { params: filters });
    return response.data;
  }

  async getBluLokDevice(id: string) {
    const response = await this.api.get(`/devices/blulok/${id}`);
    return response.data;
  }

  async getAccessControlDevice(id: string): Promise<{ success: boolean; device: AccessControlDevice }> {
    const response = await this.api.get(`/devices/access-control/${id}`);
    return response.data;
  }

  async getFacilityDeviceHierarchy(facilityId: string) {
    const response = await this.api.get(`/devices/facility/${facilityId}/hierarchy`);
    return response.data;
  }

  async getDeviceDenylist(deviceId: string) {
    const response = await this.api.get(`/devices/blulok/${deviceId}/denylist`);
    return response.data;
  }

  async pruneDenylist() {
    const response = await this.api.post('/denylist/prune');
    return response.data;
  }

  // Route Pass History endpoints
  async getUserRoutePassHistory(userId: string, filters?: {
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
    
    const response = await this.api.get(`/route-passes/users/${userId}`, { params });
    return response.data;
  }

  async createAccessControlDevice(data: CreateAccessControlDevicePayload) {
    const response = await this.api.post('/devices/access-control', data);
    return response.data;
  }

  async updateAccessControlDevice(id: string, data: UpdateAccessControlDevicePayload) {
    const response = await this.api.put(`/devices/access-control/${id}`, data);
    return response.data;
  }

  async updateAccessControlDeviceMetadata(
    id: string,
    data: import('@/types/facility.types').UpdateAccessControlDeviceMetadataPayload
  ) {
    const response = await this.api.put(`/devices/access-control/${id}/metadata`, data);
    return response.data as {
      success: boolean;
      device: unknown;
      sideEffects?: import('@/types/facility.types').DeviceMetadataSideEffects;
    };
  }

  async updateBluLokDeviceMetadata(
    id: string,
    data: import('@/types/facility.types').UpdateBluLokDeviceMetadataPayload
  ) {
    const response = await this.api.put(`/devices/blulok/${id}/metadata`, data);
    return response.data as {
      success: boolean;
      device: unknown;
      sideEffects?: import('@/types/facility.types').DeviceMetadataSideEffects;
    };
  }

  async createBluLokDevice(data: object) {
    const response = await this.api.post('/devices/blulok', data);
    return response.data;
  }

  async updateDeviceStatus(deviceType: string, id: string, status: string) {
    const response = await this.api.put(`/devices/${deviceType}/${id}/status`, { status });
    return response.data;
  }

  async updateLockStatus(id: string, lock_status: string) {
    const response = await this.api.put(`/devices/blulok/${id}/lock`, { lock_status });
    return response.data;
  }

  /** Cloud lock/unlock for access-control devices (gates, doors, elevators); same gateway OPEN/CLOSE pipeline as BluLok. */
  async updateAccessControlLockStatus(id: string, lock_status: string) {
    const response = await this.api.put(`/devices/access-control/${id}/lock`, { lock_status });
    return response.data;
  }

  async getUnassignedDevices(facilityId?: string) {
    const params = facilityId ? { facility_id: facilityId } : {};
    const response = await this.api.get('/devices/unassigned', { params });
    return response.data;
  }

  async assignDeviceToUnit(deviceId: string, unitId: string) {
    const response = await this.api.post(`/devices/blulok/${deviceId}/assign`, { unit_id: unitId });
    return response.data;
  }

  async unassignDeviceFromUnit(deviceId: string) {
    const response = await this.api.delete(`/devices/blulok/${deviceId}/unassign`);
    return response.data;
  }

  /** Admin / dev admin: delete BluLok cloud inventory row (unit link, group memberships, denylist); lock may re-sync from gateway. */
  async removeBluLokDeviceFromCloudInventory(deviceId: string) {
    const response = await this.api.delete(`/devices/blulok/${deviceId}`);
    return response.data;
  }

  // Units Management
  async getUnits(filters?: object) {
    const response = await this.api.get('/units', { params: filters });
    return response.data;
  }

  async getUnitDetails(unitId: string) {
    const response = await this.api.get(`/units/${unitId}`);
    return response.data;
  }

  async getUnit(id: string) {
    const response = await this.api.get(`/units/${id}`);
    return response.data;
  }

  async createUnit(data: object) {
    const response = await this.api.post('/units', data);
    return response.data;
  }

  async updateUnit(id: string, data: object) {
    const response = await this.api.put(`/units/${id}`, data);
    return response.data;
  }

  async assignTenantToUnit(unitId: string, tenantId: string, isPrimary: boolean) {
    const response = await this.api.post(`/units/${unitId}/assign`, { 
      tenant_id: tenantId, 
      is_primary: isPrimary 
    });
    return response.data;
  }

  async removeTenantFromUnit(unitId: string, tenantId: string) {
    const response = await this.api.delete(`/units/${unitId}/assign/${tenantId}`);
    return response.data;
  }

  async getMyUnits() {
    const response = await this.api.get('/units/my');
    return response.data;
  }

  // Device Groups
  async getDeviceGroups(facilityId: string, groupType?: 'zone' | 'access_code') {
    const response = await this.api.get('/device-groups', {
      params: {
        facility_id: facilityId,
        group_type: groupType,
      },
    });
    return response.data as { success: boolean; data: DeviceGroup[] };
  }

  async createDeviceGroup(payload: {
    facility_id: string;
    group_type?: 'zone' | 'access_code';
    is_global_shared?: boolean;
    name: string;
    description?: string;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    const response = await this.api.post('/device-groups', payload);
    return response.data as { success: boolean; data: DeviceGroup };
  }

  async updateDeviceGroup(groupId: string, payload: {
    group_type?: 'zone' | 'access_code';
    is_global_shared?: boolean;
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    is_active?: boolean;
  }) {
    const response = await this.api.put(`/device-groups/${groupId}`, payload);
    return response.data as { success: boolean; data: DeviceGroup };
  }

  async getDeviceGroup(groupId: string) {
    const response = await this.api.get(`/device-groups/${groupId}`);
    return response.data as {
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
    };
  }

  async deleteDeviceGroup(groupId: string) {
    const response = await this.api.delete(`/device-groups/${groupId}`);
    return response.data as { success: boolean };
  }

  async addDeviceGroupMember(
    groupId: string,
    payload: {
      deviceId?: string;
      unitId?: string;
      deviceType: 'access_control' | 'blulok';
    },
  ) {
    const response = await this.api.post(`/device-groups/${groupId}/members`, {
      device_id: payload.deviceId,
      unit_id: payload.unitId,
      device_type: payload.deviceType,
    });
    return response.data;
  }

  async removeDeviceGroupMember(groupId: string, deviceId: string, deviceType?: 'access_control' | 'blulok') {
    const response = await this.api.delete(`/device-groups/${groupId}/members/${deviceId}`, {
      params: deviceType ? { device_type: deviceType } : undefined,
    });
    return response.data;
  }

  // Access Codes
  async getAccessCodeConfig(facilityId: string) {
    const response = await this.api.get(`/access-codes/config/${facilityId}`);
    return response.data as { success: boolean; data: AccessCodeConfig };
  }

  async updateAccessCodeConfig(facilityId: string, payload: Partial<AccessCodeConfig>) {
    const response = await this.api.put(`/access-codes/config/${facilityId}`, payload);
    return response.data as { success: boolean; data: AccessCodeConfig };
  }

  async getAccessCodePushState(facilityId: string) {
    const response = await this.api.get(`/access-codes/push-state/${facilityId}`);
    return response.data as {
      success: boolean;
      data: {
        facility_id: string;
        status: 'pending' | 'active' | 'error';
        last_error: string | null;
        last_nonce: string | null;
        updated_at: string;
      };
    };
  }

  async getAccessCodeGroupConfig(groupId: string) {
    const response = await this.api.get(`/access-codes/groups/${groupId}/config`);
    return response.data as { success: boolean; data: AccessCodeGroupConfig };
  }

  async updateAccessCodeGroupConfig(groupId: string, payload: Partial<AccessCodeGroupConfig>) {
    const response = await this.api.put(`/access-codes/groups/${groupId}/config`, payload);
    return response.data as { success: boolean; data: AccessCodeGroupConfig };
  }

  async getAccessCodes(facilityId: string, scheduleId?: string | null) {
    const response = await this.api.get('/access-codes', {
      params: {
        facility_id: facilityId,
        schedule_id: scheduleId === undefined ? undefined : scheduleId,
      },
    });
    return response.data as { success: boolean; data: AccessCode[] };
  }

  async getEffectiveAccessCodes(facilityId: string, scheduleId?: string | null) {
    const response = await this.api.get('/access-codes/effective', {
      params: {
        facility_id: facilityId,
        schedule_id: scheduleId === undefined ? undefined : scheduleId,
      },
    });
    return response.data as { success: boolean; data: EffectiveAccessCode[] };
  }

  async rotateAccessCodes(payload: {
    facility_id: string;
    scope_type?: 'device_group' | 'device';
    scope_id?: string | null;
    schedule_id?: string | null;
  }) {
    const response = await this.api.post('/access-codes/rotate', payload);
    return response.data;
  }

  async setManualAccessCode(payload: {
    facility_id: string;
    scope_type: 'device_group' | 'device';
    scope_id?: string | null;
    code: string;
    schedule_id?: string | null;
  }) {
    const response = await this.api.put('/access-codes/manual/set', payload);
    return response.data;
  }

  async pushAccessCodesToGateway(facilityId: string) {
    const response = await this.api.post(`/access-codes/push/${facilityId}`, {});
    return response.data;
  }

  async getMyAccessCodes(facilityId?: string) {
    const response = await this.api.get('/access-codes/my', {
      params: facilityId ? { facility_id: facilityId } : undefined,
    });
    return response.data as { success: boolean; data: UserAccessCode[] };
  }

  async getAppAccessCodes(facilityId?: string) {
    const response = await this.api.get('/access-codes/app/my', {
      params: facilityId ? { facility_id: facilityId } : undefined,
    });
    return response.data as { success: boolean; data: UserAccessCode[] };
  }


  // Access History endpoints
  async getAccessHistory(filters?: {
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
  }) {
    const response = await this.api.get('/access-history', { params: filters });
    return response.data;
  }

  /** In-app notifications (user-scoped; optional facility filter matches backend `facilityId` query param) */
  async getNotifications(params?: {
    facilityId?: string;
    type?: string;
    priority?: string;
    isRead?: boolean;
    includeExpired?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get('/notifications', { params });
    return response.data as {
      success: boolean;
      notifications: UserNotificationApi[];
      total: number;
      unreadCount: number;
      limit: number;
      offset: number;
    };
  }

  async getNotificationsUnreadCount(params?: { facilityId?: string }) {
    const response = await this.api.get('/notifications/unread-count', { params });
    return response.data as { success: boolean; unreadCount: number };
  }

  async markNotificationRead(notificationId: string) {
    const response = await this.api.post(`/notifications/${notificationId}/read`);
    return response.data as { success: boolean; notification: UserNotificationApi };
  }

  async markNotificationsRead(notificationIds: string[]) {
    const response = await this.api.post('/notifications/read', { notificationIds });
    return response.data as { success: boolean; markedCount: number };
  }

  async markAllNotificationsRead(facilityId?: string) {
    const response = await this.api.post('/notifications/read-all', facilityId ? { facilityId } : {});
    return response.data as { success: boolean; markedCount: number };
  }

  async deleteNotification(notificationId: string) {
    const response = await this.api.delete(`/notifications/${notificationId}`);
    return response.data as { success: boolean; message?: string };
  }

  async getUserAccessHistory(userId: string, filters?: {
    action?: string;
    method?: string;
    denial_reason?: string;
    credential_type?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get(`/access-history/user/${userId}`, { params: filters });
    return response.data;
  }

  async getFacilityAccessHistory(facilityId: string, filters?: {
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
  }) {
    const response = await this.api.get(`/access-history/facility/${facilityId}`, { params: filters });
    return response.data;
  }

  async getUnitAccessHistory(unitId: string, filters?: {
    user_id?: string;
    action?: string;
    method?: string;
    denial_reason?: string;
    credential_type?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get(`/access-history/unit/${unitId}`, { params: filters });
    return response.data;
  }

  async getAccessLogById(id: string) {
    const response = await this.api.get(`/access-history/${id}`);
    return response.data;
  }

  async exportAccessHistory(filters?: {
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
  }) {
    const response = await this.api.get('/access-history/export', { 
      params: filters,
      responseType: 'blob'
    });
    return response.data;
  }

  async getActivityStats(options?: {
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
    const response = await this.api.get('/access-history/stats/activity', { params });
    return response.data;
  }

  // Key Sharing endpoints
  async getKeySharing(filters?: {
    unit_id?: string;
    primary_tenant_id?: string;
    shared_with_user_id?: string;
    access_level?: string;
    is_active?: boolean;
    expires_before?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get('/key-sharing', { params: filters });
    return response.data;
  }

  async getUserKeySharing(userId: string, filters?: {
    access_level?: string;
    is_active?: boolean;
    expires_before?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get(`/key-sharing/user/${userId}`, { params: filters });
    return response.data;
  }

  async getUnitKeySharing(unitId: string, filters?: {
    access_level?: string;
    is_active?: boolean;
    expires_before?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.api.get(`/key-sharing/unit/${unitId}`, { params: filters });
    return response.data;
  }

  async createKeySharing(data: {
    unit_id: string;
    shared_with_user_id: string;
    access_level: 'full' | 'limited' | 'temporary' | 'permanent';
    expires_at?: string;
    notes?: string;
    access_restrictions?: Record<string, unknown>;
  }) {
    const response = await this.api.post('/key-sharing', data);
    return response.data;
  }

  async updateKeySharing(id: string, data: {
    access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
    expires_at?: string;
    notes?: string;
    access_restrictions?: Record<string, unknown>;
    is_active?: boolean;
  }) {
    const response = await this.api.put(`/key-sharing/${id}`, data);
    return response.data;
  }

  async revokeKeySharing(id: string) {
    const response = await this.api.delete(`/key-sharing/${id}`);
    return response.data;
  }

  async getExpiredKeySharing() {
    const response = await this.api.get('/key-sharing/admin/expired');
    return response.data;
  }

  async inviteSharedKey(data: {
    unit_id: string;
    phone: string;
    access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
    expires_at?: string;
  }) {
    const response = await this.api.post('/key-sharing/invite', data);
    return response.data;
  }

  // =========================================================================
  // Firmware OTA
  // =========================================================================

  async uploadFirmware(file: File, metadata: { version: string; target_type?: string; description?: string; release_notes?: string; compatible_models?: string; minimum_version?: string }) {
    const initPayload = {
      phase: 'prepare' as const,
      version: metadata.version,
      target_type: metadata.target_type,
      filename: file.name,
      size_bytes: file.size,
      description: metadata.description,
      release_notes: metadata.release_notes,
      compatible_models: metadata.compatible_models,
      minimum_version: metadata.minimum_version,
    };

    const initResponse = await this.api.post('/firmware/upload', initPayload);
    const initData = initResponse.data?.data;

    if (initData?.upload_mode === 'signed_url') {
      const putResponse = await fetch(initData.upload_url, {
        method: 'PUT',
        headers: initData.upload_headers,
        body: file,
      });
      if (!putResponse.ok) {
        const detail = await putResponse.text().catch(() => '');
        throw new Error(
          detail
            ? `Direct storage upload failed (${putResponse.status}): ${detail}`
            : `Direct storage upload failed (${putResponse.status})`,
        );
      }

      const completeResponse = await this.api.post('/firmware/upload', {
        ...initPayload,
        phase: 'finalize',
        upload_id: initData.upload_id,
      });
      return completeResponse.data;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', metadata.version);
    if (metadata.target_type) formData.append('target_type', metadata.target_type);
    if (metadata.description) formData.append('description', metadata.description);
    if (metadata.release_notes) formData.append('release_notes', metadata.release_notes);
    if (metadata.compatible_models) formData.append('compatible_models', metadata.compatible_models);
    if (metadata.minimum_version) formData.append('minimum_version', metadata.minimum_version);
    const response = await this.api.post('/firmware/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0,
    });
    return response.data;
  }

  async listFirmware(targetType?: string) {
    const params: Record<string, string> = {};
    if (targetType) params.target_type = targetType;
    const response = await this.api.get('/firmware', { params });
    return response.data;
  }

  async getFirmwareById(id: string) {
    const response = await this.api.get(`/firmware/${id}`);
    return response.data;
  }

  async deleteFirmware(id: string) {
    const response = await this.api.delete(`/firmware/${id}`);
    return response.data;
  }

  async pushFirmware(firmwareId: string, gatewayId: string) {
    const response = await this.api.post(`/firmware/${firmwareId}/push/${gatewayId}`, {});
    return response.data;
  }

  async getFirmwarePushStatus(gatewayId: string, targetType?: string, includeEvents = true) {
    const params: Record<string, string> = {};
    if (targetType) params.target_type = targetType;
    if (!includeEvents) params.include_events = 'false';
    const response = await this.api.get(`/firmware/push-status/${gatewayId}`, { params });
    return response.data;
  }

  async getFirmwarePushHistory(gatewayId: string, targetType?: string, limit = 50, offset = 0) {
    const params: Record<string, string> = {};
    if (targetType) params.target_type = targetType;
    if (limit !== 50) params.limit = String(limit);
    if (offset > 0) params.offset = String(offset);
    const response = await this.api.get(`/firmware/push-history/${gatewayId}`, { params });
    return response.data;
  }

  async cancelFirmwarePush(pushId: string) {
    const response = await this.api.post(`/firmware/push/${pushId}/cancel`);
    return response.data;
  }

  async getFirmwarePushEvents(pushId: string, limit = 50, offset = 0, eventType?: string) {
    const params: Record<string, string> = {};
    if (limit !== 50) params.limit = String(limit);
    if (offset > 0) params.offset = String(offset);
    if (eventType) params.event_type = eventType;
    const response = await this.api.get(`/firmware/push/${pushId}/events`, { params });
    return response.data;
  }

  // Generic HTTP methods for flexibility
  async get(url: string, config?: AxiosRequestConfig) {
    const response = await this.api.get(url, config);
    return response.data;
  }

  async post(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.api.post(url, data, config);
    return response.data;
  }

  async put(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.api.put(url, data, config);
    return response.data;
  }

  async delete(url: string, config?: AxiosRequestConfig) {
    const response = await this.api.delete(url, config);
    return response.data;
  }

}

export const apiService = new ApiService();
