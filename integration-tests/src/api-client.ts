/**
 * API Client for Integration Tests
 * 
 * This is a simplified version of the frontend API service
 * that makes real HTTP calls to the backend for testing.
 */

import axios, { AxiosInstance } from 'axios';
import { config } from './setup';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UsersResponse {
  success: boolean;
  users: User[];
  total: number;
}

export interface Facility {
  id: string;
  name: string;
  address: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FacilitiesResponse {
  success: boolean;
  facilities: Facility[];
  total: number;
}

export interface KeySharing {
  id: string;
  unitId: string;
  sharedWithUserId: string;
  accessLevel: string;
  status: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KeySharingResponse {
  success: boolean;
  sharings: KeySharing[];
  total: number;
}

export class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string = config.BACKEND_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });
  }

  // Authentication
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post('/api/v1/auth/login', credentials);
    this.authToken = response.data.token;
    return response.data;
  }

  async logout(): Promise<void> {
    this.authToken = null;
  }

  // User Management
  async getUsers(filters?: any): Promise<UsersResponse> {
    const response = await this.client.get('/api/v1/users', { params: filters });
    return response.data;
  }

  async createUser(userData: any): Promise<{ success: boolean; id: string }> {
    const response = await this.client.post('/api/v1/users', userData);
    return response.data;
  }

  async getUserById(userId: string): Promise<{ success: boolean; user: User }> {
    const response = await this.client.get(`/api/v1/users/${userId}`);
    return response.data;
  }

  async updateUser(userId: string, userData: any): Promise<{ success: boolean; user: User }> {
    const response = await this.client.put(`/api/v1/users/${userId}`, userData);
    return response.data;
  }

  async deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/v1/users/${userId}`);
    return response.data;
  }

  async activateUser(userId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post(`/api/v1/users/${userId}/activate`);
    return response.data;
  }

  // Facility Management
  async getFacilities(filters?: any): Promise<FacilitiesResponse> {
    const response = await this.client.get('/api/v1/facilities', { params: filters });
    return response.data;
  }

  async createFacility(facilityData: any): Promise<{ success: boolean; id: string }> {
    const response = await this.client.post('/api/v1/facilities', facilityData);
    return response.data;
  }

  async getFacilityById(facilityId: string): Promise<{ success: boolean; facility: Facility }> {
    const response = await this.client.get(`/api/v1/facilities/${facilityId}`);
    return response.data;
  }

  async updateFacility(facilityId: string, facilityData: any): Promise<{ success: boolean; facility: Facility }> {
    const response = await this.client.put(`/api/v1/facilities/${facilityId}`, facilityData);
    return response.data;
  }

  async deleteFacility(facilityId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/v1/facilities/${facilityId}`);
    return response.data;
  }

  // Key Sharing Management
  async getKeySharing(filters?: any): Promise<KeySharingResponse> {
    const response = await this.client.get('/api/v1/key-sharing', { params: filters });
    return response.data;
  }

  async createKeySharing(sharingData: any): Promise<{ success: boolean; id: string }> {
    const response = await this.client.post('/api/v1/key-sharing', sharingData);
    return response.data;
  }

  async getKeySharingById(sharingId: string): Promise<{ success: boolean; sharing: KeySharing }> {
    const response = await this.client.get(`/api/v1/key-sharing/${sharingId}`);
    return response.data;
  }

  async updateKeySharing(sharingId: string, sharingData: any): Promise<{ success: boolean; sharing: KeySharing }> {
    const response = await this.client.put(`/api/v1/key-sharing/${sharingId}`, sharingData);
    return response.data;
  }

  async deleteKeySharing(sharingId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/api/v1/key-sharing/${sharingId}`);
    return response.data;
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; timestamp: string; uptime: number; database: any; version: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

