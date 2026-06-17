import jwt from 'jsonwebtoken';

export const TEST_JWT_SECRET = 'test-secret-key-for-testing-only-32-chars';
export const TEST_FACILITY_ID = 'facility-1';

/** Configure env vars before importing backend `createApp`. */
export function setupIntegrationTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'testpassword';
  process.env.DB_NAME = 'blulok_test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.PORT = '3000';
}

export interface IntegrationTestTokens {
  admin: string;
  devAdmin: string;
  facilityAdmin: string;
  tenant: string;
  maintenance: string;
  /** Legacy invalid role — use for negative RBAC tests only. */
  legacyUser: string;
}

export function createIntegrationTestTokens(
  secret: string = TEST_JWT_SECRET,
): IntegrationTestTokens {
  const sign = (payload: Record<string, unknown>) =>
    jwt.sign(payload, secret, { expiresIn: '1h' });

  return {
    admin: sign({ userId: 'admin-1', email: 'admin@example.com', role: 'admin' }),
    devAdmin: sign({ userId: 'dev-admin-1', email: 'dev-admin@example.com', role: 'dev_admin' }),
    facilityAdmin: sign({
      userId: 'facility-admin-1',
      email: 'facility-admin@example.com',
      role: 'facility_admin',
      facilityIds: [TEST_FACILITY_ID],
    }),
    tenant: sign({ userId: 'tenant-1', email: 'tenant@example.com', role: 'tenant' }),
    maintenance: sign({
      userId: 'maintenance-1',
      email: 'maintenance@example.com',
      role: 'maintenance',
    }),
    legacyUser: sign({ userId: 'user-1', email: 'user@example.com', role: 'user' }),
  };
}

/** Unknown `/api/v1/*` paths hit global auth before 404 handlers. */
export const UNKNOWN_API_V1_STATUSES = [401, 404] as const;

export function expectPermissionDeniedMessage(message: string): void {
  expect(
    message.includes('Insufficient permissions')
      || message.includes('permissions required')
      || message.includes('Access denied')
      || message.includes('Admin access required'),
  ).toBe(true);
}
