import { apiBaseUrl } from '@protocol/constants';
import { extractErrorMessage, unwrapEnvelope } from '../auth/backend-http.utils';
import type { UserDevicePlatform } from '@protocol/user-simulator-state';

export const MOBILE_API_PATHS = {
  login: '/auth/login',
  registerKey: '/user-devices/register-key',
  listDevices: '/user-devices/me',
  requestPass: '/passes/request',
  facilities: '/facilities',
} as const;

export type MobileFacilitySummary = {
  id: string;
  name: string;
};

export type MobileLoginResult = {
  token: string;
  userId: string;
  email: string;
  role: string;
  keyGenerationRequired?: boolean;
  isDeviceRegistered?: boolean;
  opsPublicKeyB64?: string;
};

export type RegisterKeyResult = {
  deviceId: string;
  appDeviceId: string;
  publicKey: string;
};

export type FetchRoutePassResult = {
  routePass: string;
  expiresAt?: number;
};

export type FetchFn = typeof fetch;

export class MobileApiClient {
  constructor(private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis)) {}

  async login(
    backendUrl: string,
    identifier: string,
    password: string,
    appDeviceId?: string,
    platform: UserDevicePlatform = 'ios',
  ): Promise<MobileLoginResult> {
    const url = `${apiBaseUrl(backendUrl)}${MOBILE_API_PATHS.login}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (appDeviceId) {
      headers['X-App-Device-Id'] = appDeviceId;
      headers['X-App-Platform'] = platform;
    }
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ identifier, password }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<Record<string, unknown>>(body);
    const token = String(data.token ?? body.token ?? '');
    const user = (data.user ?? body.user) as Record<string, unknown> | undefined;
    if (!token || !user?.id) throw new Error('Login response missing token or user');
    return {
      token,
      userId: String(user.id),
      email: String(user.email ?? identifier),
      role: String(user.role ?? ''),
      keyGenerationRequired: Boolean(data.key_generation_required ?? body.key_generation_required),
      isDeviceRegistered: data.isDeviceRegistered as boolean | undefined,
      opsPublicKeyB64: String(
        data.ops_public_key ?? body.ops_public_key ?? data.opsPublicKey ?? '',
      ) || undefined,
    };
  }

  async registerKey(
    backendUrl: string,
    userToken: string,
    req: {
      appDeviceId: string;
      platform: UserDevicePlatform;
      deviceName: string;
      publicKeyB64: string;
    },
  ): Promise<RegisterKeyResult> {
    const url = `${apiBaseUrl(backendUrl)}${MOBILE_API_PATHS.registerKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_device_id: req.appDeviceId,
        platform: req.platform,
        device_name: req.deviceName,
        public_key: req.publicKeyB64,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<{ device?: Record<string, unknown> }>(body);
    const device = data.device ?? (body.device as Record<string, unknown> | undefined);
    if (!device?.id) throw new Error('Register-key response missing device');
    return {
      deviceId: String(device.id),
      appDeviceId: String(device.app_device_id ?? req.appDeviceId),
      publicKey: String(device.public_key ?? req.publicKeyB64),
    };
  }

  /**
   * Facilities the user JWT can see (RBAC-scoped — same set App realtime checks).
   */
  async listFacilities(
    backendUrl: string,
    userToken: string,
    options?: { limit?: number },
  ): Promise<MobileFacilitySummary[]> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    const qs = params.toString();
    const path = qs
      ? `${MOBILE_API_PATHS.facilities}?${qs}`
      : MOBILE_API_PATHS.facilities;
    const url = `${apiBaseUrl(backendUrl)}${path}`;
    const res = await this.fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<{ facilities?: unknown }>(body);
    const raw = (data.facilities ?? body.facilities ?? []) as unknown[];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        const f = row as Record<string, unknown>;
        const id = String(f.id ?? '').trim();
        if (!id) return null;
        return { id, name: String(f.name ?? id).trim() || id };
      })
      .filter((f): f is MobileFacilitySummary => f != null);
  }

  async requestRoutePass(
    backendUrl: string,
    userToken: string,
    appDeviceId: string,
    facilityId?: string,
  ): Promise<FetchRoutePassResult> {
    const url = `${apiBaseUrl(backendUrl)}${MOBILE_API_PATHS.requestPass}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
        'X-App-Device-Id': appDeviceId,
      },
      body: JSON.stringify(facilityId ? { facility_id: facilityId } : {}),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<Record<string, unknown>>(body);
    const routePass = String(data.routePass ?? body.routePass ?? '');
    if (!routePass) throw new Error('Route pass response missing token');
    const expiresAt = parseRoutePassExp(routePass);
    return { routePass, expiresAt };
  }
}

function parseRoutePassExp(jwt: string): number | undefined {
  const parts = jwt.split('.');
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number };
    return payload.exp;
  } catch {
    return undefined;
  }
}

export const mobileApiClient = new MobileApiClient();
