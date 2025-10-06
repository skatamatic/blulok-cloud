export enum UserRole {
  TENANT = 'tenant',
  ADMIN = 'admin',
  FACILITY_ADMIN = 'facility_admin',
  MAINTENANCE = 'maintenance',
  BLULOK_TECHNICIAN = 'blulok_technician',
  DEV_ADMIN = 'dev_admin'
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  facilityNames?: string[];
  facilityIds?: string[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

export interface AuthContextType {
  authState: AuthState;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: () => void;
  isLoading: boolean;
  hasRole: (roles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  canManageUsers: () => boolean;
}
