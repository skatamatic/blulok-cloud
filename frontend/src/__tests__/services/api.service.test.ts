import { UserRole } from '@/types/auth.types';

// Create mock axios instance before importing anything
let responseErrorHandler: ((error: unknown) => unknown) | undefined;
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn((fn) => fn), eject: jest.fn() },
    response: {
      use: jest.fn((success: unknown, error?: (err: unknown) => unknown) => {
        responseErrorHandler = error;
        return success;
      }),
      eject: jest.fn(),
    },
  },
};

// Mock axios module
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockAxios),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    disconnect: jest.fn(),
  },
}));

// Import after mocking
import { apiService } from '@/services/api.service';
import { websocketService } from '@/services/websocket.service';

describe('APIService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockResponse = {
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: UserRole.ADMIN
          },
          token: 'mock-jwt-token'
        }
      };

      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await apiService.login({
        identifier: 'test@example.com',
        password: 'password123'
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/auth/login', {
        identifier: 'test@example.com',
        password: 'password123'
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should handle login failure', async () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Invalid credentials' }
        }
      };

      mockAxios.post.mockRejectedValueOnce(error);

      await expect(apiService.login({
        identifier: 'test@example.com',
        password: 'wrongpassword'
      })).rejects.toEqual(error);
    });

    it('should handle network errors', async () => {
      const error = new Error('Network Error');
      mockAxios.post.mockRejectedValueOnce(error);

      await expect(apiService.login({
        identifier: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('Network Error');
    });
  });

  describe('logout', () => {
    it('should call logout endpoint', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      
      await apiService.logout();
      
      expect(mockAxios.post).toHaveBeenCalledWith('/auth/logout');
    });
  });

  describe('getProfile', () => {
    it('should fetch user profile', async () => {
      const mockProfile = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.ADMIN
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockProfile });

      const result = await apiService.getProfile();

      expect(mockAxios.get).toHaveBeenCalledWith('/auth/profile');
      expect(result).toEqual(mockProfile);
    });

    it('should handle unauthorized response', async () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      };

      mockAxios.get.mockRejectedValueOnce(error);

      await expect(apiService.getProfile()).rejects.toEqual(error);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockResponse = { data: { success: true } };

      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await apiService.changePassword('oldPassword', 'newPassword');

      expect(mockAxios.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword',
      });

      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const mockResponse = { data: { valid: true } };

      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await apiService.verifyToken();

      expect(mockAxios.get).toHaveBeenCalledWith('/auth/verify-token');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle invalid token', async () => {
      const error = {
        response: {
          status: 401,
          data: { valid: false }
        }
      };

      mockAxios.get.mockRejectedValueOnce(error);

      await expect(apiService.verifyToken()).rejects.toEqual(error);
    });
  });

  describe('getDashboardGeneralStats', () => {
    const emptyByRole = (): Record<UserRole, number> => ({
      [UserRole.TENANT]: 0,
      [UserRole.ADMIN]: 0,
      [UserRole.DEV_ADMIN]: 0,
      [UserRole.FACILITY_ADMIN]: 0,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 0,
    });

    it('GETs aggregate stats without query params when facility_id omitted', async () => {
      const payload = {
        success: true,
        data: {
          facilities: { total: 1, active: 1, inactive: 0, maintenance: 0 },
          devices: { total: 2, online: 2, offline: 0, error: 0, maintenance: 0 },
          users: {
            total: 3,
            active: 3,
            inactive: 0,
            byRole: emptyByRole(),
          },
          alerts: { open: 0 },
          lastUpdated: '2026-01-01T00:00:00.000Z',
          scope: { type: 'all' as const },
        },
      };
      mockAxios.get.mockResolvedValueOnce({ data: payload });

      const result = await apiService.getDashboardGeneralStats();

      expect(mockAxios.get).toHaveBeenCalledWith('/dashboard/general-stats', {
        params: undefined,
      });
      expect(result).toEqual(payload);
    });

    it('passes facility_id as query param when scoped', async () => {
      const fid = '550e8400-e29b-41d4-a716-446655440001';
      const payload = {
        success: true,
        data: {
          facilities: { total: 1, active: 1, inactive: 0, maintenance: 0 },
          devices: { total: 2, online: 2, offline: 0, error: 0, maintenance: 0 },
          users: {
            total: 3,
            active: 3,
            inactive: 0,
            byRole: emptyByRole(),
          },
          alerts: { open: 0 },
          lastUpdated: '2026-01-01T00:00:00.000Z',
          scope: { type: 'facility_limited' as const, facilityIds: [fid] },
        },
      };
      mockAxios.get.mockResolvedValueOnce({ data: payload });

      const result = await apiService.getDashboardGeneralStats({ facility_id: fid });

      expect(mockAxios.get).toHaveBeenCalledWith('/dashboard/general-stats', {
        params: { facility_id: fid },
      });
      expect(result).toEqual(payload);
    });
  });

  describe('getFacilities', () => {
    it('should fetch facilities with pagination', async () => {
      const mockFacilities = {
        data: {
          facilities: [
            { id: 'facility-1', name: 'Facility 1' },
            { id: 'facility-2', name: 'Facility 2' }
          ],
          total: 2,
          page: 1,
          limit: 10
        }
      };

      mockAxios.get.mockResolvedValueOnce(mockFacilities);

      const result = await apiService.getFacilities({ page: 1, limit: 10 });

      expect(mockAxios.get).toHaveBeenCalledWith('/facilities', {
        params: { page: 1, limit: 10 }
      });

      expect(result).toEqual(mockFacilities.data);
    });
  });

  describe('facility delete (admin)', () => {
    it('should GET delete-impact summary for a facility', async () => {
      const payload = { data: { units: 2, devices: 5, gateways: 1 } };
      mockAxios.get.mockResolvedValueOnce(payload);

      const result = await apiService.getFacilityDeleteImpact('fac-uuid-1');

      expect(mockAxios.get).toHaveBeenCalledWith('/facilities/fac-uuid-1/delete-impact');
      expect(result).toEqual(payload.data);
    });

    it('should DELETE facility by id', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

      const result = await apiService.deleteFacility('fac-uuid-1');

      expect(mockAxios.delete).toHaveBeenCalledWith('/facilities/fac-uuid-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('internal gateway endpoints', () => {
    it('should GET secure time sync packet', async () => {
      const mockData = { data: { success: true, timeSyncPacket: [{ cmd_type: 'SECURE_TIME_SYNC', ts: 123 }, 'sig'] } };
      mockAxios.get.mockResolvedValueOnce(mockData);
      const res = await apiService.getSecureTimeSyncPacket();
      expect(mockAxios.get).toHaveBeenCalledWith('/internal/gateway/time-sync');
      expect(res).toEqual(mockData.data);
    });

    it('should POST request time sync for lock', async () => {
      const mockData = { data: { success: true, timeSyncPacket: [{ cmd_type: 'SECURE_TIME_SYNC', ts: 456 }, 'sig'] } };
      mockAxios.post.mockResolvedValueOnce(mockData);
      const res = await apiService.requestTimeSyncForLock('lock-1');
      expect(mockAxios.post).toHaveBeenCalledWith('/internal/gateway/request-time-sync', { lock_id: 'lock-1' });
      expect(res).toEqual(mockData.data);
    });

    it('should POST fallback pass request', async () => {
      const mockData = { data: { success: true, routePass: 'rp.jwt' } };
      mockAxios.post.mockResolvedValueOnce(mockData);
      const res = await apiService.requestFallbackPass('jwt');
      expect(mockAxios.post).toHaveBeenCalledWith('/internal/gateway/fallback-pass', { fallbackJwt: 'jwt' });
      expect(res).toEqual(mockData.data);
    });
  });

  describe('admin ops-key rotation relay', () => {
    it('should rotate ops key with managed flow', async () => {
      const mockData = {
        data: {
          success: true,
          payload: { cmd_type: 'ROTATE_OPERATIONS_KEY', new_ops_pubkey: 'pub', ts: 1 },
          signature: 'sig',
          generated_ops_key_pair: { private_key_b64: 'priv', public_key_b64: 'pub' },
        },
      };
      mockAxios.post.mockResolvedValueOnce(mockData);
      const res = await apiService.rotateOpsKey({ rootPrivateKeyB64: 'rootkey' });
      expect(mockAxios.post).toHaveBeenCalledWith('/admin/ops-key-rotation/broadcast', {
        root_private_key_b64: 'rootkey',
        custom_ops_public_key_b64: undefined,
      });
      expect(res).toEqual(mockData.data);
    });
  });

  describe('getUsers', () => {
    it('should fetch users with filters', async () => {
      const mockUsers = {
        data: {
          users: [
            { id: 'user-1', email: 'user1@example.com', role: UserRole.TENANT },
            { id: 'user-2', email: 'user2@example.com', role: UserRole.ADMIN }
          ],
          total: 2
        }
      };

      mockAxios.get.mockResolvedValueOnce(mockUsers);

      const result = await apiService.getUsers({ role: UserRole.TENANT });

      expect(mockAxios.get).toHaveBeenCalledWith('/users', {
        params: { role: UserRole.TENANT }
      });

      expect(result).toEqual(mockUsers.data);
    });
  });

  describe('getUnits', () => {
    it('should fetch units', async () => {
      const mockUnits = {
        data: {
          units: [
            { id: 'unit-1', name: 'Unit 1', facilityId: 'facility-1' },
            { id: 'unit-2', name: 'Unit 2', facilityId: 'facility-1' }
          ],
          total: 2
        }
      };

      mockAxios.get.mockResolvedValueOnce(mockUnits);

      const result = await apiService.getUnits();

      expect(mockAxios.get).toHaveBeenCalledWith('/units', {
        params: undefined
      });

      expect(result).toEqual(mockUnits.data);
    });
  });

  describe('unit assignment endpoints', () => {
    it('should assign tenant to unit with primary/shared flag', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await apiService.assignTenantToUnit('unit-1', 'tenant-2', false);

      expect(mockAxios.post).toHaveBeenCalledWith('/units/unit-1/assign', {
        tenant_id: 'tenant-2',
        is_primary: false,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should remove tenant from unit assignment', async () => {
      const mockResponse = { data: { success: true } };
      mockAxios.delete.mockResolvedValueOnce(mockResponse);

      const result = await apiService.removeTenantFromUnit('unit-1', 'tenant-2');

      expect(mockAxios.delete).toHaveBeenCalledWith('/units/unit-1/assign/tenant-2');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('error handling', () => {
    it('should handle 500 server errors', async () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Internal Server Error' }
        }
      };

      mockAxios.get.mockRejectedValueOnce(error);

      await expect(apiService.getProfile()).rejects.toEqual(error);
    });

    it('should handle network errors', async () => {
      const error = new Error('Network Error');
      mockAxios.get.mockRejectedValueOnce(error);

      await expect(apiService.getProfile()).rejects.toThrow('Network Error');
    });
  });

  describe('Gateway Management', () => {
    describe('createGateway', () => {
      it('should successfully create a gateway', async () => {
        const gatewayData = {
          facility_id: 'facility-1',
          name: 'Test Gateway',
          gateway_type: 'http'
        };

        const mockResponse = {
          data: {
            success: true,
            gateway: {
              id: 'gateway-1',
              ...gatewayData
            }
          }
        };

        mockAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await apiService.createGateway(gatewayData);

        expect(mockAxios.post).toHaveBeenCalledWith('/gateways', gatewayData);
        expect(result).toEqual(mockResponse.data);
      });

      it('should handle creation errors', async () => {
        const error = new Error('Creation failed');
        mockAxios.post.mockRejectedValueOnce(error);

        await expect(apiService.createGateway({})).rejects.toThrow('Creation failed');
      });
    });

    describe('getGateways', () => {
      it('should successfully get gateways with filters', async () => {
        const filters = { facility_id: 'facility-1' };
        const mockResponse = {
          data: {
            success: true,
            gateways: [
              {
                id: 'gateway-1',
                name: 'Test Gateway',
                facility_id: 'facility-1'
              }
            ]
          }
        };

        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await apiService.getGateways(filters);

        expect(mockAxios.get).toHaveBeenCalledWith('/gateways', { params: filters });
        expect(result).toEqual(mockResponse.data);
      });

      it('should get all gateways without filters', async () => {
        const mockResponse = {
          data: {
            success: true,
            gateways: []
          }
        };

        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await apiService.getGateways();

        expect(mockAxios.get).toHaveBeenCalledWith('/gateways', { params: undefined });
        expect(result).toEqual(mockResponse.data);
      });
    });

    describe('getGateway', () => {
      it('should successfully get a specific gateway', async () => {
        const gatewayId = 'gateway-1';
        const mockResponse = {
          data: {
            success: true,
            gateway: {
              id: gatewayId,
              name: 'Test Gateway'
            }
          }
        };

        mockAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await apiService.getGateway(gatewayId);

        expect(mockAxios.get).toHaveBeenCalledWith(`/gateways/${gatewayId}`);
        expect(result).toEqual(mockResponse.data);
      });
    });

    describe('updateGateway', () => {
      it('should successfully update a gateway', async () => {
        const gatewayId = 'gateway-1';
        const updateData = {
          name: 'Updated Gateway',
          gateway_type: 'physical'
        };

        const mockResponse = {
          data: {
            success: true,
            gateway: {
              id: gatewayId,
              ...updateData
            }
          }
        };

        mockAxios.put.mockResolvedValueOnce(mockResponse);

        const result = await apiService.updateGateway(gatewayId, updateData);

        expect(mockAxios.put).toHaveBeenCalledWith(`/gateways/${gatewayId}`, updateData);
        expect(result).toEqual(mockResponse.data);
      });
    });

    describe('updateGatewayStatus', () => {
      it('should successfully update gateway status', async () => {
        const gatewayId = 'gateway-1';
        const status = 'online';

        const mockResponse = {
          data: {
            success: true,
            message: 'Status updated'
          }
        };

        mockAxios.put.mockResolvedValueOnce(mockResponse);

        const result = await apiService.updateGatewayStatus(gatewayId, status);

        expect(mockAxios.put).toHaveBeenCalledWith(`/gateways/${gatewayId}/status`, { status });
        expect(result).toEqual(mockResponse.data);
      });
    });

    describe('deleteGateway', () => {
      it('should successfully delete a gateway', async () => {
        const gatewayId = 'gateway-1';
        const mockResponse = {
          data: {
            success: true,
            message: 'Gateway deleted'
          }
        };

        mockAxios.delete.mockResolvedValueOnce(mockResponse);

        const result = await apiService.deleteGateway(gatewayId);

        expect(mockAxios.delete).toHaveBeenCalledWith(`/gateways/${gatewayId}`);
        expect(result).toEqual(mockResponse.data);
      });
    });

    describe('testGatewayConnection', () => {
      it('should successfully test gateway connection', async () => {
        const gatewayId = 'gateway-1';
        const mockResponse = {
          data: {
            success: true,
            message: 'Connection test successful'
          }
        };

        mockAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await apiService.testGatewayConnection(gatewayId);

        expect(mockAxios.post).toHaveBeenCalledWith(`/gateways/${gatewayId}/test-connection`);
        expect(result).toEqual(mockResponse.data);
      });

      it('should handle connection test failures', async () => {
        const gatewayId = 'gateway-1';
        const error = new Error('Connection failed');
        mockAxios.post.mockRejectedValueOnce(error);

        await expect(apiService.testGatewayConnection(gatewayId)).rejects.toThrow('Connection failed');
      });
    });

    describe('syncGateway', () => {
      it('should successfully sync gateway', async () => {
        const gatewayId = 'gateway-1';
        const mockResponse = {
          data: {
            success: true,
            message: 'Sync completed successfully'
          }
        };

        mockAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await apiService.syncGateway(gatewayId);

        expect(mockAxios.post).toHaveBeenCalledWith(`/gateways/${gatewayId}/sync`);
        expect(result).toEqual(mockResponse.data);
      });

      it('should handle sync failures', async () => {
        const gatewayId = 'gateway-1';
        const error = new Error('Sync failed');
        mockAxios.post.mockRejectedValueOnce(error);

        await expect(apiService.syncGateway(gatewayId)).rejects.toThrow('Sync failed');
      });
    });
  });

  describe('createUser', () => {
    it('posts user payload to /users', async () => {
      const payload = { email: 'n@example.com', firstName: 'N', lastName: 'U', role: 'tenant' };
      mockAxios.post.mockResolvedValueOnce({ data: { success: true, id: 'new-1' } });

      const result = await apiService.createUser(payload);

      expect(mockAxios.post).toHaveBeenCalledWith('/users', payload);
      expect(result).toEqual({ success: true, id: 'new-1' });
    });
  });

  describe('widget layout endpoints', () => {
    it('getWidgetLayouts GETs /widget-layouts', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { layouts: [] } });
      const result = await apiService.getWidgetLayouts();
      expect(mockAxios.get).toHaveBeenCalledWith('/widget-layouts', { params: undefined });
      expect(result).toEqual({ layouts: [] });
    });

    it('saveWidgetLayouts POSTs body', async () => {
      const layouts = [
        {
          widgetId: 'w1',
          widgetType: 'stats-facilities',
          layoutConfig: { position: { x: 0, y: 0, w: 3, h: 2 } },
          displayOrder: 0,
          isVisible: true,
        },
      ];
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });
      await apiService.saveWidgetLayouts(layouts);
      expect(mockAxios.post).toHaveBeenCalledWith('/widget-layouts', { layouts });
    });
  });

  describe('access history endpoints', () => {
    it('getAccessHistory passes query params', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { logs: [], total: 0 } });
      await apiService.getAccessHistory({ limit: 20, user_id: 'u-1' });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history', {
        params: { limit: 20, user_id: 'u-1' },
      });
    });

    it('getFacilityAccessHistory uses facility-scoped path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { logs: [], total: 0 } });
      await apiService.getFacilityAccessHistory('fac-1', { limit: 50 });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/facility/fac-1', {
        params: { limit: 50 },
      });
    });

    it('exportAccessHistory requests a blob', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: new Blob() });
      await apiService.exportAccessHistory({ date_from: '2024-01-01' });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/export', {
        params: { date_from: '2024-01-01' },
        responseType: 'blob',
      });
    });

    it('getUserAccessHistory uses user-scoped path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { logs: [], total: 0 } });
      await apiService.getUserAccessHistory('user-9', { limit: 10, action: 'unlock' });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/user/user-9', {
        params: { limit: 10, action: 'unlock' },
      });
    });

    it('getUnitAccessHistory uses unit-scoped path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { logs: [], total: 0 } });
      await apiService.getUnitAccessHistory('unit-2', { offset: 20 });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/unit/unit-2', {
        params: { offset: 20 },
      });
    });

    it('getAccessLogById GETs single log', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { id: 'log-1' } });
      const result = await apiService.getAccessLogById('log-1');
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/log-1');
      expect(result).toEqual({ id: 'log-1' });
    });

    it('getActivityStats passes period and facility_ids', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { series: [] } });
      await apiService.getActivityStats({ period: 'week', facility_ids: ['a', 'b'] });
      expect(mockAxios.get).toHaveBeenCalledWith('/access-history/stats/activity', {
        params: { period: 'week', facility_ids: ['a', 'b'] },
      });
    });
  });

  describe('notifications endpoints', () => {
    it('getNotifications passes query params', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          notifications: [],
          total: 0,
          unreadCount: 0,
          limit: 20,
          offset: 0,
        },
      });
      await apiService.getNotifications({ facilityId: 'f1', isRead: false, limit: 5 });
      expect(mockAxios.get).toHaveBeenCalledWith('/notifications', {
        params: { facilityId: 'f1', isRead: false, limit: 5 },
      });
    });

    it('getNotificationsUnreadCount GETs unread-count', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { success: true, unreadCount: 3 } });
      const result = await apiService.getNotificationsUnreadCount({ facilityId: 'f1' });
      expect(mockAxios.get).toHaveBeenCalledWith('/notifications/unread-count', {
        params: { facilityId: 'f1' },
      });
      expect(result.unreadCount).toBe(3);
    });

    it('markNotificationRead POSTs read endpoint', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, notification: { id: 'n1' } },
      });
      await apiService.markNotificationRead('n1');
      expect(mockAxios.post).toHaveBeenCalledWith('/notifications/n1/read');
    });

    it('markNotificationsRead POSTs batch', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true, markedCount: 2 } });
      await apiService.markNotificationsRead(['a', 'b']);
      expect(mockAxios.post).toHaveBeenCalledWith('/notifications/read', {
        notificationIds: ['a', 'b'],
      });
    });

    it('markAllNotificationsRead sends facility when provided', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true, markedCount: 5 } });
      await apiService.markAllNotificationsRead('fac-x');
      expect(mockAxios.post).toHaveBeenCalledWith('/notifications/read-all', { facilityId: 'fac-x' });
    });

    it('deleteNotification DELETEs resource', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });
      await apiService.deleteNotification('n9');
      expect(mockAxios.delete).toHaveBeenCalledWith('/notifications/n9');
    });
  });

  describe('key sharing endpoints', () => {
    it('getKeySharing passes params', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { sharings: [] } });
      await apiService.getKeySharing({ limit: 20, is_active: true });
      expect(mockAxios.get).toHaveBeenCalledWith('/key-sharing', {
        params: { limit: 20, is_active: true },
      });
    });

    it('getUserKeySharing uses user path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { sharings: [] } });
      await apiService.getUserKeySharing('u1', { is_active: true, limit: 5 });
      expect(mockAxios.get).toHaveBeenCalledWith('/key-sharing/user/u1', {
        params: { is_active: true, limit: 5 },
      });
    });

    it('getUnitKeySharing uses unit path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { sharings: [] } });
      await apiService.getUnitKeySharing('unit-z', { access_level: 'full' });
      expect(mockAxios.get).toHaveBeenCalledWith('/key-sharing/unit/unit-z', {
        params: { access_level: 'full' },
      });
    });

    it('createKeySharing POSTs body', async () => {
      const body = {
        unit_id: 'u1',
        shared_with_user_id: 'u2',
        access_level: 'full' as const,
      };
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'ks1' } });
      await apiService.createKeySharing(body);
      expect(mockAxios.post).toHaveBeenCalledWith('/key-sharing', body);
    });

    it('updateKeySharing PUTs partial payload', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { success: true } });
      await apiService.updateKeySharing('ks1', { is_active: false });
      expect(mockAxios.put).toHaveBeenCalledWith('/key-sharing/ks1', { is_active: false });
    });

    it('revokeKeySharing DELETEs resource', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });
      await apiService.revokeKeySharing('ks1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/key-sharing/ks1');
    });

    it('getExpiredKeySharing GETs admin expired list', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { sharings: [] } });
      await apiService.getExpiredKeySharing();
      expect(mockAxios.get).toHaveBeenCalledWith('/key-sharing/admin/expired');
    });

    it('inviteSharedKey POSTs invite payload', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { invited: true } });
      await apiService.inviteSharedKey({
        unit_id: 'u1',
        phone: '+15550001',
        access_level: 'limited',
      });
      expect(mockAxios.post).toHaveBeenCalledWith('/key-sharing/invite', {
        unit_id: 'u1',
        phone: '+15550001',
        access_level: 'limited',
      });
    });
  });

  describe('firmware OTA endpoints', () => {
    it('listFirmware GETs with optional target_type', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { items: [] } });
      await apiService.listFirmware('gateway');
      expect(mockAxios.get).toHaveBeenCalledWith('/firmware', { params: { target_type: 'gateway' } });
    });

    it('listFirmware omits params when targetType undefined', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { items: [] } });
      await apiService.listFirmware();
      expect(mockAxios.get).toHaveBeenCalledWith('/firmware', { params: {} });
    });

    it('getFirmwareById GETs single record', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { id: 'fw1', version: '1.0.0' } });
      const result = await apiService.getFirmwareById('fw1');
      expect(mockAxios.get).toHaveBeenCalledWith('/firmware/fw1');
      expect(result).toEqual({ id: 'fw1', version: '1.0.0' });
    });

    it('deleteFirmware DELETEs record', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });
      await apiService.deleteFirmware('fw1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/firmware/fw1');
    });

    it('pushFirmware POSTs push command', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { queued: true } });
      await apiService.pushFirmware('fw1', 'gw1');
      expect(mockAxios.post).toHaveBeenCalledWith('/firmware/fw1/push/gw1', {});
    });

    it('pushFirmware includes delivery_mode when provided', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { queued: true } });
      await apiService.pushFirmware('fw1', 'gw1', { deliveryMode: 'v2' });
      expect(mockAxios.post).toHaveBeenCalledWith('/firmware/fw1/push/gw1', { delivery_mode: 'v2' });
    });

    it('getFirmwarePushStatus passes include_events when false', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'idle' } });
      await apiService.getFirmwarePushStatus('gw1', 'lock', false);
      expect(mockAxios.get).toHaveBeenCalledWith('/firmware/push-status/gw1', {
        params: { target_type: 'lock', include_events: 'false' },
      });
    });

    it('uploadFirmware uses init then multipart when storage is local', async () => {
      const file = new File(['x'], 'fw.bin', { type: 'application/octet-stream' });
      mockAxios.post
        .mockResolvedValueOnce({ data: { data: { upload_mode: 'direct_multipart' } } })
        .mockResolvedValueOnce({ data: { id: 'new-fw' } });
      await apiService.uploadFirmware(file, { version: '2.0.0', target_type: 'gateway' });
      expect(mockAxios.post).toHaveBeenNthCalledWith(1, '/firmware/upload', expect.objectContaining({
        phase: 'prepare',
        version: '2.0.0',
        filename: 'fw.bin',
        size_bytes: file.size,
      }));
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        2,
        '/firmware/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 0,
        }),
      );
    });
  });

  describe('auth and user management HTTP mapping', () => {
    it('logout POSTs /auth/logout', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.logout();
      expect(mockAxios.post).toHaveBeenCalledWith('/auth/logout');
    });

    it('getProfile GETs /auth/profile', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
      await apiService.getProfile();
      expect(mockAxios.get).toHaveBeenCalledWith('/auth/profile');
    });

    it('getDashboardGeneralStats passes facility_id when set', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
      await apiService.getDashboardGeneralStats({ facility_id: 'f1' });
      expect(mockAxios.get).toHaveBeenCalledWith('/dashboard/general-stats', {
        params: { facility_id: 'f1' },
      });
    });

    it('verifyToken GETs /auth/verify-token', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { valid: true } });
      await apiService.verifyToken();
      expect(mockAxios.get).toHaveBeenCalledWith('/auth/verify-token');
    });

    it('changePassword POSTs body', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });
      await apiService.changePassword('old', 'new');
      expect(mockAxios.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'old',
        newPassword: 'new',
      });
    });

    it('getUsers passes query params', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { users: [] } });
      await apiService.getUsers({ search: 'a', role: 'tenant', facility: 'f1', limit: 10 });
      expect(mockAxios.get).toHaveBeenCalledWith('/users', {
        params: { search: 'a', role: 'tenant', facility: 'f1', limit: 10 },
      });
    });

    it('getUser GETs by id', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getUser('u1');
      expect(mockAxios.get).toHaveBeenCalledWith('/users/u1');
    });

    it('updateUser PUTs', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateUser('u1', { firstName: 'A' });
      expect(mockAxios.put).toHaveBeenCalledWith('/users/u1', { firstName: 'A' });
    });

    it('deactivateUser DELETEs', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.deactivateUser('u1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/users/u1');
    });

    it('activateUser POSTs activate', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.activateUser('u1');
      expect(mockAxios.post).toHaveBeenCalledWith('/users/u1/activate');
    });

    it('getUserDetails GETs details path', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getUserDetails('u1');
      expect(mockAxios.get).toHaveBeenCalledWith('/users/u1/details');
    });

    it('deleteUserDevice DELETEs admin path', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.deleteUserDevice('dev1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/user-devices/admin/dev1');
    });

    it('user facility endpoints', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });
      await apiService.getUserFacilities('u1');
      expect(mockAxios.get).toHaveBeenCalledWith('/user-facilities/u1');

      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.setUserFacilities('u1', ['f1']);
      expect(mockAxios.put).toHaveBeenCalledWith('/user-facilities/u1', { facilityIds: ['f1'] });

      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.addUserToFacility('u1', 'f1');
      expect(mockAxios.post).toHaveBeenCalledWith('/user-facilities/u1/facilities/f1');

      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.removeUserFromFacility('u1', 'f1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/user-facilities/u1/facilities/f1');
    });
  });

  describe('widget layout and system settings HTTP mapping', () => {
    it('updateWidget PUTs widget-layouts id', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateWidget('w1', { isVisible: false });
      expect(mockAxios.put).toHaveBeenCalledWith(
        '/widget-layouts/w1',
        { isVisible: false },
        { params: undefined }
      );
    });

    it('hideWidget DELETEs widget', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.hideWidget('w1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/widget-layouts/w1', { params: undefined });
    });

    it('hideWidget passes pageId as a query param when provided', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.hideWidget('w1', 'page-1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/widget-layouts/w1', {
        params: { pageId: 'page-1' },
      });
    });

    it('showWidget POSTs show', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.showWidget('w1');
      expect(mockAxios.post).toHaveBeenCalledWith('/widget-layouts/w1/show');
    });

    it('resetWidgetLayout POSTs reset', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.resetWidgetLayout();
      expect(mockAxios.post).toHaveBeenCalledWith('/widget-layouts/reset', {
        activeFacilityId: undefined,
      });
    });

    it('getWidgetTemplates GETs templates', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });
      await apiService.getWidgetTemplates();
      expect(mockAxios.get).toHaveBeenCalledWith('/widget-layouts/templates');
    });

    it('getSystemSettings and updateSystemSettings', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getSystemSettings();
      expect(mockAxios.get).toHaveBeenCalledWith('/system-settings');

      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateSystemSettings({ x: 1 });
      expect(mockAxios.put).toHaveBeenCalledWith('/system-settings', { x: 1 });
    });

    it('notification settings paths', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getNotificationSettings();
      expect(mockAxios.get).toHaveBeenCalledWith('/system-settings/notifications');

      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateNotificationSettings({ enabled: true });
      expect(mockAxios.put).toHaveBeenCalledWith('/system-settings/notifications', { enabled: true });
    });
  });

  describe('facilities and gateways HTTP mapping', () => {
    it('getFacilities GETs with params', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { facilities: [] } });
      await apiService.getFacilities({ search: 'x' });
      expect(mockAxios.get).toHaveBeenCalledWith('/facilities', { params: { search: 'x' } });
    });

    it('getFacility GETs one', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getFacility('f1');
      expect(mockAxios.get).toHaveBeenCalledWith('/facilities/f1');
    });

    it('createFacility POSTs', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'f1' } });
      await apiService.createFacility({ name: 'N' });
      expect(mockAxios.post).toHaveBeenCalledWith('/facilities', { name: 'N' });
    });

    it('updateFacility PUTs', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateFacility('f1', { name: 'X' });
      expect(mockAxios.put).toHaveBeenCalledWith('/facilities/f1', { name: 'X' });
    });

    it('deleteFacility DELETEs', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.deleteFacility('f1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/facilities/f1');
    });

    it('getGateways GETs', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });
      await apiService.getGateways({ facility_id: 'f1' });
      expect(mockAxios.get).toHaveBeenCalledWith('/gateways', { params: { facility_id: 'f1' } });
    });

    it('getGateway GETs one', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await apiService.getGateway('g1');
      expect(mockAxios.get).toHaveBeenCalledWith('/gateways/g1');
    });

    it('updateGateway PUTs', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: {} });
      await apiService.updateGateway('g1', { name: 'G' });
      expect(mockAxios.put).toHaveBeenCalledWith('/gateways/g1', { name: 'G' });
    });

    it('deleteGateway DELETEs', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });
      await apiService.deleteGateway('g1');
      expect(mockAxios.delete).toHaveBeenCalledWith('/gateways/g1');
    });

    it('testGatewayConnection and syncGateway', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { ok: true } });
      await apiService.testGatewayConnection('g1');
      expect(mockAxios.post).toHaveBeenCalledWith('/gateways/g1/test-connection');

      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.syncGateway('g1');
      expect(mockAxios.post).toHaveBeenCalledWith('/gateways/g1/sync');
    });

    it('command queue helpers', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });
      await apiService.getCommandQueue({ status: 'pending', limit: 5 });
      expect(mockAxios.get).toHaveBeenCalledWith('/commands/pending', {
        params: { status: 'pending', limit: 5 },
      });

      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.retryCommand('c1');
      expect(mockAxios.post).toHaveBeenCalledWith('/commands/c1/retry');

      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await apiService.cancelCommand('c1');
      expect(mockAxios.post).toHaveBeenCalledWith('/commands/c1/cancel');
    });
  });

  describe('device lock commands and schedules', () => {
    it('updateLockStatus PUTs BluLok lock body with optional tenant override', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { success: true } });
      await apiService.updateLockStatus('dev-1', 'unlocked', {
        reason: 'emergency',
        notes: 'Flood',
      });
      expect(mockAxios.put).toHaveBeenCalledWith('/devices/blulok/dev-1/lock', {
        lock_status: 'unlocked',
        tenant_override_reason: 'emergency',
        tenant_override_notes: 'Flood',
      });
    });

    it('updateLockStatus omits override fields when not provided', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { success: true } });
      await apiService.updateLockStatus('dev-1', 'locked');
      expect(mockAxios.put).toHaveBeenCalledWith('/devices/blulok/dev-1/lock', {
        lock_status: 'locked',
      });
    });

    it('updateAccessControlLockStatus forwards open_until when set', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { success: true } });
      await apiService.updateAccessControlLockStatus('ac-1', 'unlocked', {
        open_until: 1710000000,
      });
      expect(mockAxios.put).toHaveBeenCalledWith('/devices/access-control/ac-1/lock', {
        lock_status: 'unlocked',
        open_until: 1710000000,
      });
    });

    it('setUserScheduleForFacility PUTs scheduleId', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { success: true } });
      await apiService.setUserScheduleForFacility('user-1', 'fac-1', 'sched-9');
      expect(mockAxios.put).toHaveBeenCalledWith(
        '/users/user-1/facilities/fac-1/schedule',
        { scheduleId: 'sched-9' },
      );
    });

    it('getEffectiveAccessCodes passes schedule_id including explicit null', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { success: true, data: [] } });
      await apiService.getEffectiveAccessCodes('fac-1', 'sched-1');
      expect(mockAxios.get).toHaveBeenCalledWith('/access-codes/effective', {
        params: { facility_id: 'fac-1', schedule_id: 'sched-1' },
      });

      mockAxios.get.mockResolvedValueOnce({ data: { success: true, data: [] } });
      await apiService.getEffectiveAccessCodes('fac-1', null);
      expect(mockAxios.get).toHaveBeenCalledWith('/access-codes/effective', {
        params: { facility_id: 'fac-1', schedule_id: null },
      });
    });
  });

  describe('auth response interceptor', () => {
    it('clears stored auth and disconnects websocket on 401 responses', async () => {
      expect(typeof responseErrorHandler).toBe('function');

      localStorage.setItem('authToken', 'expired-token');
      localStorage.setItem('authUser', JSON.stringify({ id: 'u1' }));

      const locationMock = { href: '' };
      Object.defineProperty(window, 'location', {
        value: locationMock,
        writable: true,
        configurable: true,
      });

      await expect(
        responseErrorHandler!({ response: { status: 401 } }),
      ).rejects.toEqual({ response: { status: 401 } });

      expect(localStorage.getItem('authToken')).toBeNull();
      expect(localStorage.getItem('authUser')).toBeNull();
      expect(websocketService.disconnect).toHaveBeenCalled();
      expect(locationMock.href).toBe('/login');
    });

    it('does not clear auth for non-401 errors', async () => {
      localStorage.setItem('authToken', 'still-valid');

      await expect(
        responseErrorHandler!({ response: { status: 500 } }),
      ).rejects.toEqual({ response: { status: 500 } });

      expect(localStorage.getItem('authToken')).toBe('still-valid');
      expect(websocketService.disconnect).not.toHaveBeenCalled();
    });
  });
});
