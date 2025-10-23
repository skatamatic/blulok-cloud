import { UserRole } from '@/types/auth.types';

// Create mock axios instance before importing anything
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn((fn) => fn), eject: jest.fn() },
    response: { use: jest.fn((fn) => fn), eject: jest.fn() },
  },
};

// Mock axios module
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockAxios),
  },
}));

// Import after mocking
import { apiService } from '@/services/api.service';

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
        email: 'test@example.com',
        password: 'password123'
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
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
        email: 'test@example.com',
        password: 'wrongpassword'
      })).rejects.toEqual(error);
    });

    it('should handle network errors', async () => {
      const error = new Error('Network Error');
      mockAxios.post.mockRejectedValueOnce(error);

      await expect(apiService.login({
        email: 'test@example.com',
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
});
