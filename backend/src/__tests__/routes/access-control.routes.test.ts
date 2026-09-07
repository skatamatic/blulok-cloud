import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

// Mock the AccessControlService - factory must use inline mocks (jest.mock is hoisted)
jest.mock('@/services/access-control.service', () => ({
  AccessControlService: {
    getInstance: jest.fn().mockReturnValue({
      getAccessControlDevices: jest.fn(),
      getFacilityAccessControlSummary: jest.fn(),
      getAccessControlDeviceById: jest.fn(),
    }),
  },
}));

import { AccessControlService } from '@/services/access-control.service';

describe('Access Control Routes', () => {
  let app: any;
  let testData: MockTestData;
  let mockService: any;

  const mockDevice = {
    id: 'device-1',
    name: 'Main Gate',
    deviceType: 'gate',
    locationDescription: 'Facility entrance',
    status: 'online',
    isLocked: true,
    lastActivity: new Date(),
    facilityId: '550e8400-e29b-41d4-a716-446655440001',
    gatewayId: 'gateway-1',
  };

  beforeAll(async () => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockService = AccessControlService.getInstance() as any;

    // Reset and set default mock returns
    mockService.getAccessControlDevices.mockReset().mockResolvedValue({
      devices: [mockDevice],
      total: 1,
    });
    mockService.getFacilityAccessControlSummary.mockReset().mockResolvedValue({
      facilityId: testData.facilities.facility1.id,
      facilityName: 'Test Facility 1',
      devices: [mockDevice],
      summary: {
        total: 1,
        byType: { doors: 0, gates: 1, elevators: 0 },
        byStatus: { online: 1, offline: 0, error: 0, maintenance: 0 },
      },
    });
    mockService.getAccessControlDeviceById.mockReset().mockResolvedValue(mockDevice);
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all access control endpoints', async () => {
      let response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`);
      expectUnauthorized(response);

      response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/summary`);
      expectUnauthorized(response);

      response = await request(app)
        .get('/api/v1/access-control/devices/550e8400-e29b-41d4-a716-446655440001');
      expectUnauthorized(response);
    }, 30000);
  });

  describe('GET /api/v1/access-control/facilities/:facilityId/devices - List Devices', () => {
    it('should return access control devices for facility', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('devices');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
    });

    it('should accept device type filter', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ deviceType: 'gate' })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should accept status filter', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ status: 'online' })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should accept search, sort, and pagination parameters', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({
          search: 'Main',
          sortBy: 'name',
          sortOrder: 'asc',
          limit: 10,
          offset: 0,
        })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid device type', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ deviceType: 'invalid' })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ status: 'unknown' })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid sortBy', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ sortBy: 'invalid_field' })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid facilityId format', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/facilities/not-a-uuid/devices')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should reject limit exceeding max', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .query({ limit: 200 })
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectBadRequest(response);
    });

    it('should allow admin access to any facility', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/devices`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });

  describe('GET /api/v1/access-control/facilities/:facilityId/summary - Summary', () => {
    it('should return facility access control summary', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/summary`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilityId');
      expect(response.body).toHaveProperty('facilityName');
      expect(response.body).toHaveProperty('devices');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.summary).toHaveProperty('byType');
      expect(response.body.summary).toHaveProperty('byStatus');
    });

    it('should reject invalid facilityId format', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/facilities/not-a-uuid/summary')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should allow admin access', async () => {
      const response = await request(app)
        .get(`/api/v1/access-control/facilities/${testData.facilities.facility1.id}/summary`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });

  describe('GET /api/v1/access-control/devices/:deviceId - Single Device', () => {
    it('should return a single device', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/devices/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('device');
    });

    it('should return 404 when device not found', async () => {
      mockService.getAccessControlDeviceById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/access-control/devices/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectNotFound(response);
    });

    it('should reject invalid deviceId format', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/devices/not-a-uuid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
    });

    it('should work for facility admin', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/devices/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should work for tenant', async () => {
      const response = await request(app)
        .get('/api/v1/access-control/devices/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });
});
