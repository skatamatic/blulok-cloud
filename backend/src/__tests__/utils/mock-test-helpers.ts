import { UserRole } from '../../types/auth.types';
import { AuthService } from '../../services/auth.service';

export interface MockTestUser {
  id: string;
  email: string;
  role: UserRole;
  facilityIds?: string[];
  token: string;
}

export interface MockTestData {
  users: {
    devAdmin: MockTestUser;
    admin: MockTestUser;
    facilityAdmin: MockTestUser;
    tenant: MockTestUser;
    maintenance: MockTestUser;
    otherTenant: MockTestUser;
    facility2Tenant: MockTestUser;
  };
  facilities: {
    facility1: any;
    facility2: any;
  };
  units: {
    unit1: any;
    unit2: any;
    unit3: any;
  };
  accessLogs: {
    log1: any;
    log2: any;
    log3: any;
  };
}

export function createMockTestUsers(): {
  devAdmin: MockTestUser;
  admin: MockTestUser;
  facilityAdmin: MockTestUser;
  tenant: MockTestUser;
  maintenance: MockTestUser;
  otherTenant: MockTestUser;
  facility2Tenant: MockTestUser;
} {
  // Create mock users without database calls
  const devAdminUser = {
    id: 'dev-admin-1',
    email: 'devadmin@test.com',
    password_hash: 'hashed-password',
    first_name: 'Dev',
    last_name: 'Admin',
    role: UserRole.DEV_ADMIN,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const adminUser = {
    id: 'admin-1',
    email: 'admin@test.com',
    password_hash: 'hashed-password',
    first_name: 'Admin',
    last_name: 'User',
    role: UserRole.ADMIN,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const facilityAdminUser = {
    id: 'facility-admin-1',
    email: 'facilityadmin@test.com',
    password_hash: 'hashed-password',
    first_name: 'Facility',
    last_name: 'Admin',
    role: UserRole.FACILITY_ADMIN,
    facilityIds: ['550e8400-e29b-41d4-a716-446655440001', 'facility-1'], // Support both UUID and legacy ID
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const tenantUser = {
    id: 'tenant-1',
    email: 'tenant@test.com',
    password_hash: 'hashed-password',
    first_name: 'Tenant',
    last_name: 'User',
    role: UserRole.TENANT,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const maintenanceUser = {
    id: 'maintenance-1',
    email: 'maintenance@test.com',
    password_hash: 'hashed-password',
    first_name: 'Maintenance',
    last_name: 'User',
    role: UserRole.MAINTENANCE,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const otherTenantUser = {
    id: 'other-tenant-1',
    email: 'othertenant@test.com',
    password_hash: 'hashed-password',
    first_name: 'Other',
    last_name: 'Tenant',
    role: UserRole.TENANT,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const facility2TenantUser = {
    id: 'facility2-tenant-1',
    email: 'facility2tenant@test.com',
    password_hash: 'hashed-password',
    first_name: 'Facility2',
    last_name: 'Tenant',
    role: UserRole.TENANT,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  return {
    devAdmin: {
      id: devAdminUser.id,
      email: devAdminUser.email,
      role: UserRole.DEV_ADMIN,
      token: AuthService.generateToken(devAdminUser),
    },
    admin: {
      id: adminUser.id,
      email: adminUser.email,
      role: UserRole.ADMIN,
      token: AuthService.generateToken(adminUser),
    },
    facilityAdmin: {
      id: facilityAdminUser.id,
      email: facilityAdminUser.email,
      role: UserRole.FACILITY_ADMIN,
      facilityIds: ['550e8400-e29b-41d4-a716-446655440001', 'facility-1'],
      token: AuthService.generateToken(facilityAdminUser, ['550e8400-e29b-41d4-a716-446655440001', 'facility-1']),
    },
    tenant: {
      id: tenantUser.id,
      email: tenantUser.email,
      role: UserRole.TENANT,
      facilityIds: ['550e8400-e29b-41d4-a716-446655440001', 'facility-1'],
      token: AuthService.generateToken(tenantUser, ['550e8400-e29b-41d4-a716-446655440001', 'facility-1']),
    },
    maintenance: {
      id: maintenanceUser.id,
      email: maintenanceUser.email,
      role: UserRole.MAINTENANCE,
      facilityIds: ['550e8400-e29b-41d4-a716-446655440001', 'facility-1'],
      token: AuthService.generateToken(maintenanceUser, ['550e8400-e29b-41d4-a716-446655440001', 'facility-1']),
    },
    otherTenant: {
      id: otherTenantUser.id,
      email: otherTenantUser.email,
      role: UserRole.TENANT,
      token: AuthService.generateToken(otherTenantUser),
    },
    facility2Tenant: {
      id: facility2TenantUser.id,
      email: facility2TenantUser.email,
      role: UserRole.TENANT,
      facilityIds: ['550e8400-e29b-41d4-a716-446655440002', 'facility-2'],
      token: AuthService.generateToken(facility2TenantUser, ['550e8400-e29b-41d4-a716-446655440002', 'facility-2']),
    },
  };
}

export function createMockTestData(): MockTestData {
  const users = createMockTestUsers();
  
  const facilities = {
    facility1: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Facility 1',
      address: '123 Test St',
      contact_email: 'facility1@test.com',
      contact_phone: '123-456-7890',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
    facility2: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Test Facility 2',
      address: '456 Other St',
      contact_email: 'facility2@test.com',
      contact_phone: '987-654-3210',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const units = {
    unit1: {
      id: '550e8400-e29b-41d4-a716-446655440011',
      unit_number: 'A-101',
      unit_type: 'storage',
      facility_id: facilities.facility1.id,
      status: 'occupied',
      created_at: new Date(),
      updated_at: new Date(),
    },
    unit2: {
      id: '550e8400-e29b-41d4-a716-446655440012',
      unit_number: 'A-102',
      unit_type: 'storage',
      facility_id: facilities.facility2.id,
      status: 'occupied',
      created_at: new Date(),
      updated_at: new Date(),
    },
    unit3: {
      id: '550e8400-e29b-41d4-a716-446655440013',
      unit_number: 'B-201',
      unit_type: 'storage',
      facility_id: facilities.facility2.id,
      status: 'occupied',
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const accessLogs = {
    log1: {
      id: 'log-1',
      device_id: 'device-1',
      device_type: 'blulok',
      facility_id: facilities.facility1.id,
      unit_id: units.unit1.id,
      user_id: users.tenant.id,
      action: 'unlock',
      method: 'mobile_app',
      success: true,
      occurred_at: new Date(),
      created_at: new Date(),
    },
    log2: {
      id: 'log-2',
      device_id: 'device-2',
      device_type: 'blulok',
      facility_id: facilities.facility1.id,
      unit_id: units.unit2.id,
      user_id: users.otherTenant.id,
      action: 'lock',
      method: 'mobile_app',
      success: true,
      occurred_at: new Date(),
      created_at: new Date(),
    },
    log3: {
      id: 'log-3',
      device_id: 'device-3',
      device_type: 'access_control',
      facility_id: facilities.facility2.id,
      user_id: users.admin.id,
      action: 'access_granted',
      method: 'card',
      success: true,
      occurred_at: new Date(),
      created_at: new Date(),
    },
  };

  return {
    users,
    facilities,
    units,
    accessLogs,
  };
}

export function expectUnauthorized(response: any) {
  expect(response.status).toBe(401);
  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('message');
}

export function expectForbidden(response: any) {
  expect(response.status).toBe(403);
  // Handle both old and new error formats
  if (response.body.success !== undefined) {
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
  } else {
    expect(response.body).toHaveProperty('error');
  }
}

export function expectNotFound(response: any) {
  expect(response.status).toBe(404);
  // Handle both old and new error formats
  if (response.body.success !== undefined) {
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
  } else {
    expect(response.body).toHaveProperty('error');
  }
}

export function expectBadRequest(response: any) {
  expect(response.status).toBe(400);
  // Handle both old and new error formats
  if (response.body.success !== undefined) {
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
  } else {
    expect(response.body).toHaveProperty('error');
  }
}

export function expectSuccess(response: any) {
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
}

export function expectConflict(response: any) {
  expect(response.status).toBe(409);
  expect(response.body).toHaveProperty('success', false);
}