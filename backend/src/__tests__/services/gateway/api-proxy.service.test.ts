import axios from 'axios';
import { ApiProxyService } from '@/services/gateway/api-proxy.service';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';

jest.mock('axios');
jest.mock('@/services/auth.service', () => ({
  AuthService: {
    generateToken: jest.fn().mockReturnValue('passthrough-token'),
  },
}));

const mockAxiosRequest = axios.request as jest.Mock;

describe('ApiProxyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ApiProxyService as unknown as { instance?: ApiProxyService }).instance = undefined;
    mockAxiosRequest.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { success: true },
    });
  });

  it('forwards gateway identity headers when proxying from WS', async () => {
    const svc = ApiProxyService.getInstance();
    await svc.proxyRequest({
      user: {
        userId: 'user-1',
        role: UserRole.ADMIN,
        facilityIds: ['fac-1'],
        email: 'admin@test.com',
      },
      connectionFacilityId: 'fac-1',
      gatewayId: 'gw-candidate',
      sessionRole: 'swap_candidate',
      method: 'POST',
      path: '/internal/gateway/devices/inventory',
      body: { facility_id: 'fac-1', devices: [] },
    });

    expect(mockAxiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Gateway-Id': 'gw-candidate',
          'X-Gateway-Session-Role': 'swap_candidate',
        }),
      }),
    );
  });

  it('forwards request with passthrough auth and facility header', async () => {
    const svc = ApiProxyService.getInstance();
    const result = await svc.proxyRequest({
      user: {
        userId: 'user-1',
        role: UserRole.ADMIN,
        facilityIds: ['fac-1'],
        email: 'admin@test.com',
      },
      connectionFacilityId: 'fac-1',
      method: 'GET',
      path: '/devices/blulok/dev-1',
      query: { limit: 10 },
    });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ success: true });
    expect(AuthService.generateToken).toHaveBeenCalled();
    expect(mockAxiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer passthrough-token',
          'X-Gateway-Facility-Id': 'fac-1',
        }),
        params: { limit: 10 },
      }),
    );
  });

  it('rejects cross-facility proxy for facility_admin before axios', async () => {
    const svc = ApiProxyService.getInstance();

    await expect(
      svc.proxyRequest({
        user: {
          userId: 'fa-1',
          role: UserRole.FACILITY_ADMIN,
          facilityIds: ['fac-a'],
        },
        connectionFacilityId: 'fac-a',
        method: 'DELETE',
        path: '/devices/blulok/dev-1',
        body: { facility_id: 'fac-b' },
      }),
    ).rejects.toThrow(/Forbidden facility scope/);

    expect(mockAxiosRequest).not.toHaveBeenCalled();
  });
});
