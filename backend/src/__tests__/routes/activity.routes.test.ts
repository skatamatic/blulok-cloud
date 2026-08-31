import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

// Mock the ActivityService - factory must use inline mocks (jest.mock is hoisted)
jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn().mockReturnValue({
      logActivity: jest.fn(),
      getActivityLogs: jest.fn(),
      getUnitActivity: jest.fn(),
      getDeviceActivity: jest.fn(),
      getFacilityActivity: jest.fn(),
      logLockEvent: jest.fn(),
      logAccessAttempt: jest.fn(),
      logStatusChange: jest.fn(),
      logAssignmentChange: jest.fn(),
    }),
  },
}));

import { ActivityService } from '@/services/activity.service';

describe('Activity Routes', () => {
  let app: any;
  let testData: MockTestData;
  let mockService: any;

  const mockActivityResponse = {
    id: 'activity-1',
    entityType: 'device',
    entityId: 'device-1',
    activityType: 'lock',
    title: 'Device Locked',
    description: 'Device was locked',
    actor: { type: 'user', id: 'user-1', name: 'John Doe' },
    result: 'success',
    resultMessage: null,
    facilityId: '550e8400-e29b-41d4-a716-446655440001',
    unitId: 'unit-1',
    deviceId: 'device-1',
    metadata: null,
    occurredAt: new Date(),
    unitNumber: 'A-101',
    deviceSerial: 'SN-12345',
    facilityName: 'Test Facility',
  };

  beforeAll(async () => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockService = ActivityService.getInstance() as any;

    // Reset and set default mock returns
    mockService.getActivityLogs.mockReset().mockResolvedValue({
      activities: [mockActivityResponse],
      total: 1,
    });
    mockService.getFacilityActivity.mockReset().mockResolvedValue({
      activities: [mockActivityResponse],
      total: 1,
    });
    mockService.getUnitActivity.mockReset().mockResolvedValue({
      activities: [mockActivityResponse],
      total: 1,
    });
    mockService.getDeviceActivity.mockReset().mockResolvedValue({
      activities: [mockActivityResponse],
      total: 1,
    });
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all activity endpoints', async () => {
      let response = await request(app).get('/api/v1/activity');
      expectUnauthorized(response);

      response = await request(app).get(`/api/v1/activity/facilities/${testData.facilities.facility1.id}`);
      expectUnauthorized(response);

      response = await request(app).get(`/api/v1/activity/units/${testData.units.unit1.id}`);
      expectUnauthorized(response);

      response = await request(app).get('/api/v1/activity/devices/550e8400-e29b-41d4-a716-446655440001');
      expectUnauthorized(response);
    }, 30000);
  });

  describe('GET /api/v1/activity - List Activity Logs', () => {
    it('should return activity logs for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
    });

    it('should accept all valid filter parameters', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({
          entityType: 'device',
          activityType: 'lock',
          actorType: 'user',
          result: 'success',
          facilityId: testData.facilities.facility1.id,
          limit: 10,
          offset: 0,
        })
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should accept date range filters', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({
          fromDate: '2026-01-01T00:00:00Z',
          toDate: '2026-02-08T23:59:59Z',
        })
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid entityType', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({ entityType: 'invalid' })
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid activityType', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({ activityType: 'invalid_type' })
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid result filter', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({ result: 'invalid' })
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should reject limit exceeding max', async () => {
      const response = await request(app)
        .get('/api/v1/activity')
        .query({ limit: 200 })
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should work for all user roles', async () => {
      for (const userKey of ['admin', 'facilityAdmin', 'tenant', 'maintenance'] as const) {
        const response = await request(app)
          .get('/api/v1/activity')
          .set('Authorization', `Bearer ${testData.users[userKey].token}`)
          .expect(200);

        expectSuccess(response);
      }
    });
  });

  describe('GET /api/v1/activity/facilities/:facilityId - Facility Activity', () => {
    it('should return activity for a facility', async () => {
      const response = await request(app)
        .get(`/api/v1/activity/facilities/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('facilityId');
    });

    it('should accept date range and pagination', async () => {
      const response = await request(app)
        .get(`/api/v1/activity/facilities/${testData.facilities.facility1.id}`)
        .query({
          fromDate: '2026-01-01T00:00:00Z',
          toDate: '2026-02-08T23:59:59Z',
          limit: 25,
          offset: 0,
        })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid facilityId format', async () => {
      const response = await request(app)
        .get('/api/v1/activity/facilities/not-a-uuid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should allow admin access to any facility', async () => {
      const response = await request(app)
        .get(`/api/v1/activity/facilities/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });

  describe('GET /api/v1/activity/units/:unitId - Unit Activity', () => {
    it('should return activity for a unit', async () => {
      const response = await request(app)
        .get(`/api/v1/activity/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('unitId');
    });

    it('should accept pagination', async () => {
      const response = await request(app)
        .get(`/api/v1/activity/units/${testData.units.unit1.id}`)
        .query({ limit: 10, offset: 5 })
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid unitId format', async () => {
      const response = await request(app)
        .get('/api/v1/activity/units/not-a-uuid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });
  });

  describe('GET /api/v1/activity/devices/:deviceId - Device Activity', () => {
    it('should return activity for a device', async () => {
      const response = await request(app)
        .get('/api/v1/activity/devices/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('deviceId');
    });

    it('should accept pagination', async () => {
      const response = await request(app)
        .get('/api/v1/activity/devices/550e8400-e29b-41d4-a716-446655440001')
        .query({ limit: 10, offset: 5 })
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid deviceId format', async () => {
      const response = await request(app)
        .get('/api/v1/activity/devices/not-a-uuid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });
  });
});
