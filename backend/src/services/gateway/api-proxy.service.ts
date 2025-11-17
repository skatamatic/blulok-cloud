import axios from 'axios';
import { config } from '@/config/environment';
import { FacilityGuardService } from './facility-guard.service';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';

export class ApiProxyService {
  private static instance: ApiProxyService;
  private constructor() {}
  public static getInstance(): ApiProxyService {
    if (!this.instance) this.instance = new ApiProxyService();
    return this.instance;
  }

  public async proxyRequest(params: {
    user: { userId: string; role: UserRole; facilityIds?: string[]; email?: string };
    connectionFacilityId: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    query?: any;
    body?: any;
  }): Promise<{ status: number; headers: any; data: any }> {
    const { user, connectionFacilityId, method, path, headers, query, body } = params;

    // Enforce facility scope for FACILITY_ADMIN
    FacilityGuardService.ensureWithinScope(user.role, connectionFacilityId, path, body);

    const baseUrl = (process.env.GATEWAY_PROXY_BASE_URL || `http://127.0.0.1:${config.port}/api/v1`).replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${normalizedPath}`;

    // Create a short-lived passthrough token for downstream route auth
    const passthroughToken = AuthService.generateToken({
      id: user.userId,
      email: user.email || '',
      first_name: '',
      last_name: '',
      role: user.role,
      password_hash: '',
      is_active: true,
    } as any, user.facilityIds || []);

    const hdrs: Record<string, string> = {
      ...(headers || {}),
      Authorization: `Bearer ${passthroughToken}`,
      'X-Gateway-Facility-Id': connectionFacilityId,
    };

    const resp = await axios.request({
      url,
      method,
      headers: hdrs,
      params: query,
      data: body,
      validateStatus: () => true,
    });

    return { status: resp.status, headers: resp.headers, data: resp.data };
  }
}


