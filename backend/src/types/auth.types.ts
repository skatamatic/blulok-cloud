export enum UserRole {
  TENANT = 'tenant',
  ADMIN = 'admin',
  FACILITY_ADMIN = 'facility_admin',
  MAINTENANCE = 'maintenance',
  BLULOK_TECHNICIAN = 'blulok_technician',
  DEV_ADMIN = 'dev_admin'
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  facilityIds?: string[]; // For facility-scoped users
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  token?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
}

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
