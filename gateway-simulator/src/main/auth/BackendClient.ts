import { apiBaseUrl } from '@protocol/constants';
import type {
  FacilitySummary,
  GatewayRecordDetail,
  GatewayRecordSummary,
  LoginRequest,
  LoginResponse,
} from '@protocol/ipc-channels';
import { extractErrorMessage, readJsonBody, unwrapEnvelope } from './backend-http.utils';
import { AuthenticatedApiClient, type FetchFn } from './authenticated-api.client';
import { API_PATHS } from './backend-api.paths';
import type {
  CloudUserDetail,
  CloudUserSummary,
  MintUserSessionResult,
} from './backend-api.types';

export { API_PATHS } from './backend-api.paths';
export type {
  CloudUserDetail,
  CloudUserDeviceRecord,
  CloudUserSummary,
  FmsConfigRecord,
  MintUserSessionResult,
} from './backend-api.types';
export type { FetchFn } from './authenticated-api.client';

export class BackendClient {
  private readonly api: AuthenticatedApiClient;
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = globalThis.fetch.bind(globalThis)) {
    this.fetchFn = fetchFn;
    this.api = new AuthenticatedApiClient({ backendUrl: '', token: null, fetchFn });
  }

  getToken(): string | null {
    return this.api.getToken();
  }

  getBackendUrl(): string {
    return this.api.getBackendUrl();
  }

  restoreSession(backendUrl: string, token: string): void {
    this.api.setBackendUrl(backendUrl);
    this.api.setToken(token);
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    this.api.setBackendUrl(request.backendUrl);
    const url = `${apiBaseUrl(this.api.getBackendUrl())}${API_PATHS.login}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: request.email, password: request.password }),
    });
    const body = await readJsonBody(res);
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<Record<string, unknown>>(body);
    const token = (data.token ?? body.token) as string | undefined;
    const user = (data.user ?? body.user) as Record<string, unknown> | undefined;
    if (!token) throw new Error('Login response missing token');
    this.api.setToken(token);
    return {
      token,
      user: {
        id: String(user?.id ?? ''),
        email: String(user?.email ?? request.email),
        role: String(user?.role ?? ''),
      },
    };
  }

  async listFacilities(options?: { limit?: number; offset?: number }): Promise<FacilitySummary[]> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString();
    const path = qs ? `${API_PATHS.facilities}?${qs}` : API_PATHS.facilities;
    const data = await this.api.get<{ facilities?: FacilitySummary[] }>(path);
    return data.facilities ?? [];
  }

  async listGateways(facilityId: string): Promise<GatewayRecordSummary[]> {
    const params = new URLSearchParams({ facility_id: facilityId });
    const data = await this.api.get<{ gateways?: GatewayRecordSummary[] }>(
      `${API_PATHS.gateways}?${params.toString()}`,
    );
    return data.gateways ?? [];
  }

  async getGatewayStatus(facilityId: string): Promise<unknown> {
    return this.api.get(API_PATHS.gatewayStatus(facilityId));
  }

  async getGateway(gatewayId: string): Promise<GatewayRecordDetail> {
    const data = await this.api.get<{ gateway?: GatewayRecordDetail }>(`${API_PATHS.gateways}/${gatewayId}`);
    const gateway = data.gateway ?? (data as unknown as GatewayRecordDetail);
    if (!gateway?.id) throw new Error('Gateway response missing record');
    return gateway;
  }

  async listUsers(options?: {
    search?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: CloudUserSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.search) params.set('search', options.search);
    if (options?.role) params.set('role', options.role);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString();
    const path = qs ? `${API_PATHS.users}?${qs}` : API_PATHS.users;
    const data = await this.api.get<{ users?: CloudUserSummary[]; total?: number }>(path);
    return { users: data.users ?? [], total: data.total ?? 0 };
  }

  async getUserDetail(userId: string): Promise<CloudUserDetail> {
    const data = await this.api.get<{ user?: CloudUserDetail & { devices?: CloudUserDetail['devices'] } }>(
      `${API_PATHS.user(userId)}/details`,
    );
    const user = data.user;
    if (!user?.id) throw new Error('User response missing record');
    return user;
  }

  async mintSimulatorUserSession(userId: string): Promise<MintUserSessionResult> {
    if (!this.api.getToken()) throw new Error('Not logged in');
    const url = `${apiBaseUrl(this.api.getBackendUrl())}${API_PATHS.simulatorUserSession}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.api.getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    const body = await readJsonBody(res);
    if (!res.ok) {
      throw new Error(extractErrorMessage(body, res.status));
    }
    const data = unwrapEnvelope<Record<string, unknown>>(body);
    const token = String(data.token ?? body.token ?? '');
    if (!token) throw new Error('Session response missing token');
    const user = (data.user ?? body.user) as Record<string, unknown> | undefined;
    return {
      token,
      expiresAt: (data.expiresAt ?? body.expiresAt) as number | undefined,
      user: {
        id: String(user?.id ?? userId),
        email: user?.email != null ? String(user.email) : null,
        firstName: String(user?.firstName ?? user?.first_name ?? ''),
        lastName: String(user?.lastName ?? user?.last_name ?? ''),
        role: String(user?.role ?? ''),
      },
      opsPublicKeyB64: String(data.ops_public_key ?? body.ops_public_key ?? '') || undefined,
    };
  }

  async updateGateway(
    gatewayId: string,
    patch: { name?: string; mac_address?: string | null },
  ): Promise<GatewayRecordDetail> {
    const data = await this.api.put<{ gateway?: GatewayRecordDetail }>(`${API_PATHS.gateways}/${gatewayId}`, patch);
    const gateway = data.gateway ?? (data as unknown as GatewayRecordDetail);
    if (!gateway?.id) throw new Error('Gateway update response missing record');
    return gateway;
  }

  /** Sticker ZTP claim — requires live provision session for device_id. */
  async claimGateway(body: {
    facility_id: string;
    device_id: string;
    public_key: string;
    name?: string;
  }): Promise<{
    gateway: GatewayRecordDetail;
    created?: boolean;
    bound?: boolean;
    sessionRole?: 'active' | 'swap_candidate';
  }> {
    const data = await this.api.post<{
      gateway?: GatewayRecordDetail;
      created?: boolean;
      bound?: boolean;
      sessionRole?: 'active' | 'swap_candidate';
    }>(API_PATHS.gatewaysClaim, body);
    const gateway = data.gateway;
    if (!gateway?.id) throw new Error('Claim response missing gateway');
    return {
      gateway,
      created: data.created,
      bound: data.bound,
      sessionRole: data.sessionRole,
    };
  }

  /** Unbind ZTP gateway from facility (keeps public_key for same-sticker re-claim). */
  async releaseGateway(gatewayId: string): Promise<GatewayRecordDetail> {
    const data = await this.api.post<{ gateway?: GatewayRecordDetail }>(
      API_PATHS.gatewayRelease(gatewayId),
      {},
    );
    const gateway = data.gateway;
    if (!gateway?.id) throw new Error('Release response missing gateway');
    return gateway;
  }

  async listFmsConfigs(options?: { webhooksOnly?: boolean }): Promise<import('./backend-api.types').FmsConfigRecord[]> {
    const params = new URLSearchParams();
    if (options?.webhooksOnly) params.set('webhooks_only', 'true');
    const qs = params.toString();
    const path = qs ? `${API_PATHS.fmsConfigs}?${qs}` : API_PATHS.fmsConfigs;
    const data = await this.api.get<{ configs?: import('./backend-api.types').FmsConfigRecord[] }>(path);
    return data.configs ?? [];
  }
}

export const backendClient = new BackendClient();
