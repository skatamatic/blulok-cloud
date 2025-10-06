import axios, { AxiosInstance, AxiosError } from 'axios';
import { LoginCredentials, LoginResponse } from '@/types/auth.types';

// Safe access to import.meta for Jest compatibility
const getApiBaseUrl = () => {
  // Access import.meta through globalThis to avoid Jest parse errors
  const importMeta = (globalThis as any).import?.meta || (globalThis as any)['import.meta'];
  return importMeta?.env?.VITE_API_URL || 'http://localhost:3000';
};

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
  }) {
    const response = await this.api.get('/users', { params });
    return response.data;
  }

  async getUser(id: string) {
    const response = await this.api.get(`/users/${id}`);
    return response.data;
  }

  async createUser(userData: any) {
    const response = await this.api.post('/users', userData);
    return response.data;
  }

  async updateUser(id: string, userData: any) {
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
  async getWidgetLayouts() {
    const response = await this.api.get('/widget-layouts');
    return response.data;
  }

  async saveWidgetLayouts(layouts: Array<{
    widgetId: string;
    layoutConfig: any;
    displayOrder: number;
    isVisible?: boolean;
  }>) {
    const response = await this.api.post('/widget-layouts', { layouts });
    return response.data;
  }

  async updateWidget(widgetId: string, data: {
    layoutConfig?: any;
    isVisible?: boolean;
    displayOrder?: number;
  }) {
    const response = await this.api.put(`/widget-layouts/${widgetId}`, data);
    return response.data;
  }

  async hideWidget(widgetId: string) {
    const response = await this.api.delete(`/widget-layouts/${widgetId}`);
    return response.data;
  }

  async showWidget(widgetId: string) {
    const response = await this.api.post(`/widget-layouts/${widgetId}/show`);
    return response.data;
  }

  async resetWidgetLayout() {
    const response = await this.api.post('/widget-layouts/reset');
    return response.data;
  }

  async getWidgetTemplates() {
    const response = await this.api.get('/widget-layouts/templates');
    return response.data;
  }

  // Facilities Management
  async getFacilities(filters?: any) {
    const response = await this.api.get('/facilities', { params: filters });
    return response.data;
  }

  async getFacility(id: string) {
    const response = await this.api.get(`/facilities/${id}`);
    return response.data;
  }

  async createFacility(data: any) {
    const response = await this.api.post('/facilities', data);
    return response.data;
  }

  async updateFacility(id: string, data: any) {
    const response = await this.api.put(`/facilities/${id}`, data);
    return response.data;
  }

  async deleteFacility(id: string) {
    const response = await this.api.delete(`/facilities/${id}`);
    return response.data;
  }

  async createGateway(data: any) {
    const response = await this.api.post('/gateways', data);
    return response.data;
  }

  // Devices Management
  async getDevices(filters?: any) {
    const response = await this.api.get('/devices', { params: filters });
    return response.data;
  }

  async getFacilityDeviceHierarchy(facilityId: string) {
    const response = await this.api.get(`/devices/facility/${facilityId}/hierarchy`);
    return response.data;
  }

  async createAccessControlDevice(data: any) {
    const response = await this.api.post('/devices/access-control', data);
    return response.data;
  }

  async createBluLokDevice(data: any) {
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

  // Units Management
  async getUnits(filters?: any) {
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

  async createUnit(data: any) {
    const response = await this.api.post('/units', data);
    return response.data;
  }

  async updateUnit(id: string, data: any) {
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
    access_level: string;
    expires_at?: string;
    notes?: string;
    access_restrictions?: string;
  }) {
    const response = await this.api.post('/key-sharing', data);
    return response.data;
  }

  async updateKeySharing(id: string, data: {
    access_level?: string;
    expires_at?: string;
    notes?: string;
    access_restrictions?: string;
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

  // Generic HTTP methods for flexibility
  async get(url: string, config?: any) {
    const response = await this.api.get(url, config);
    return response.data;
  }

  async post(url: string, data?: any, config?: any) {
    const response = await this.api.post(url, data, config);
    return response.data;
  }

  async put(url: string, data?: any, config?: any) {
    const response = await this.api.put(url, data, config);
    return response.data;
  }

  async delete(url: string, config?: any) {
    const response = await this.api.delete(url, config);
    return response.data;
  }

}

export const apiService = new ApiService();
