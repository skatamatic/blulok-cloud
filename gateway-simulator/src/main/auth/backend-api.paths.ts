/** Query shapes aligned with backend Joi schemas (gateway.schemas.ts, facilities.schemas.ts). */
export const API_PATHS = {
  login: '/auth/login',
  facilities: '/facilities',
  gateways: '/gateways',
  gatewayStatus: (facilityId: string) => `/gateways/status/${facilityId}`,
  users: '/users',
  user: (userId: string) => `/users/${userId}`,
  simulatorUserSession: '/dev/simulator/user-session',
  fmsConfigs: '/fms/config',
  fmsWebhook: (facilityId: string) => `/fms/webhook/${facilityId}`,
} as const;
