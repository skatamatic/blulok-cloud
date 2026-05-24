import { UserRole } from '@/types/auth.types';

export const DEV_ROLE_TEST_PASSWORD = 'DevTest123!@#';

export interface DevRoleTestAccountDefinition {
  id: string;
  email: string;
  loginIdentifier: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  label: string;
}

export const DEV_ROLE_TEST_ACCOUNTS: DevRoleTestAccountDefinition[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440020',
    email: 'dev.facilityadmin@blulok.com',
    loginIdentifier: 'dev.facilityadmin@blulok.com',
    password: DEV_ROLE_TEST_PASSWORD,
    firstName: 'Dev',
    lastName: 'Facility Admin',
    role: UserRole.FACILITY_ADMIN,
    label: 'Facility Admin',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440021',
    email: 'dev.maintenance@blulok.com',
    loginIdentifier: 'dev.maintenance@blulok.com',
    password: DEV_ROLE_TEST_PASSWORD,
    firstName: 'Dev',
    lastName: 'Maintenance',
    role: UserRole.MAINTENANCE,
    label: 'Maintenance',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440022',
    email: 'dev.tenant@blulok.com',
    loginIdentifier: 'dev.tenant@blulok.com',
    password: DEV_ROLE_TEST_PASSWORD,
    firstName: 'Dev',
    lastName: 'Tenant',
    role: UserRole.TENANT,
    label: 'Tenant',
  },
];

export const DEV_STUB_FACILITY_ID = '550e8400-e29b-41d4-a716-446655440030';
