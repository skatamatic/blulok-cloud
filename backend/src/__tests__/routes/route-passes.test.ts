import request from 'supertest';
import { createApp } from '@/app';
import { UserRole } from '@/types/auth.types';

let mockUserRole: UserRole = UserRole.DEV_ADMIN;

// Mock authentication middleware
jest.mock('@/middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    if (!req.user) {
      req.user = {
        userId: 'mock-user',
        role: mockUserRole,
      };
    }
    next();
  },
  requireTenant: (req: any, res: any, next: any) => next(),
  requireNotTenant: (req: any, res: any, next: any) => next(),
  requireUserManagement: (req: any, res: any, next: any) => {
    if (!req.user) {
      req.user = {
        userId: 'mock-user',
        role: mockUserRole,
      };
    }
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => next(),
  requireDevAdmin: (req: any, res: any, next: any) => {
    if (!req.user) {
      req.user = {
        userId: 'mock-user',
        role: mockUserRole,
      };
    }
    if (req.user.role !== UserRole.DEV_ADMIN) {
      return res.status(403).json({ success: false, message: 'dev_admin required' });
    }
    next();
  },
  requireAdminOrFacilityAdmin: (req: any, res: any, next: any) => next(),
  requireUserManagementOrSelf: (req: any, res: any, next: any) => next(),
  requireRoles: () => (req: any, res: any, next: any) => {
    if (!req.user) {
      req.user = {
        userId: 'mock-user',
        role: mockUserRole,
      };
    }
    next();
  },
}));

// Create mock instance that will be reused
const mockGetUserHistory = jest.fn();
const mockGetUserHistoryCount = jest.fn();

jest.mock('@/models/route-pass-issuance.model', () => ({
  RoutePassIssuanceModel: jest.fn().mockImplementation(() => ({
    getUserHistory: mockGetUserHistory,
    getUserHistoryCount: mockGetUserHistoryCount,
  })),
}));

describe('Route Passes Routes', () => {
  let app: any;

  beforeEach(() => {
    mockUserRole = UserRole.DEV_ADMIN;
    app = createApp();
    mockGetUserHistory.mockClear();
    mockGetUserHistoryCount.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/route-passes/users/:userId', () => {
    it('returns route pass history for dev admin', async () => {
      const mockHistory = [
        {
          id: 'log-1',
          user_id: 'user-1',
          device_id: 'device-1',
          audiences: ['lock:lock-1', 'lock:lock-2'],
          jti: 'jwt-id-123',
          issued_at: new Date('2024-01-01'),
          expires_at: new Date('2024-01-02'),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockGetUserHistory.mockResolvedValue(mockHistory);
      mockGetUserHistoryCount.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('log-1');
      expect(response.body.pagination.total).toBe(1);
    });

    it('applies pagination correctly', async () => {
      const mockHistory = Array.from({ length: 50 }, (_, i) => ({
        id: `log-${i}`,
        user_id: 'user-1',
        device_id: `device-${i}`,
        audiences: ['lock:lock-1'],
        jti: `jwt-id-${i}`,
        issued_at: new Date(),
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }));

      mockGetUserHistory.mockResolvedValue(mockHistory);
      mockGetUserHistoryCount.mockResolvedValue(100);

      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1?limit=50&offset=0')
        .expect(200);

      expect(response.body.data).toHaveLength(50);
      expect(response.body.pagination.total).toBe(100);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('applies date filters', async () => {
      mockGetUserHistory.mockResolvedValue([]);
      mockGetUserHistoryCount.mockResolvedValue(0);

      await request(app)
        .get('/api/v1/route-passes/users/user-1?startDate=2024-01-01&endDate=2024-12-31')
        .expect(200);

      expect(mockGetUserHistory).toHaveBeenCalledWith('user-1', {
        limit: 50,
        offset: 0,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      });
    });

    it('rejects non-dev-admin users', async () => {
      mockUserRole = UserRole.TENANT;

      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('dev_admin');
    });

    it('validates limit range', async () => {
      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1?limit=200')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Limit');
    });

    it('validates offset', async () => {
      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1?offset=-1')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Offset');
    });

    it('validates date formats', async () => {
      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1?startDate=invalid-date')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('startDate');
    });

    it('handles errors gracefully', async () => {
      mockGetUserHistory.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/v1/route-passes/users/user-1')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});

