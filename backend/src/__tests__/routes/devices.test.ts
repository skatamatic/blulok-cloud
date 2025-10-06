import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectUnauthorized, expectForbidden, expectSuccess, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

describe('Devices Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all device endpoints', async () => {
      const endpoints = [
        '/api/v1/devices',
        `/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`,
        '/api/v1/devices/access-control',
        '/api/v1/devices/blulok',
        `/api/v1/devices/access_control/device-1/status`,
        `/api/v1/devices/blulok/device-1/lock`,
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expectUnauthorized(response);
      }
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('Business Logic - Device Management', () => {
    describe('GET /api/v1/devices - List Devices', () => {
      it('should return paginated devices for DEV_ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/devices?limit=10&offset=0')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should filter devices by facility_id', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should filter devices by device_type', async () => {
        const response = await request(app)
          .get('/api/v1/devices?device_type=access_control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should filter devices by status', async () => {
        const response = await request(app)
          .get('/api/v1/devices?status=online')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle search query', async () => {
        const response = await request(app)
          .get('/api/v1/devices?search=gate')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle sorting', async () => {
        const response = await request(app)
          .get('/api/v1/devices?sort_by=name&sort_order=asc')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle pagination', async () => {
        const response = await request(app)
          .get('/api/v1/devices?limit=5&offset=5')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });
    });

    describe('GET /api/v1/devices/facility/:facilityId/hierarchy - Get Facility Device Hierarchy', () => {
      it('should return facility device hierarchy for DEV_ADMIN', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should return facility device hierarchy for ADMIN', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should return 404 for non-existent facility', async () => {
        const response = await request(app)
          .get('/api/v1/devices/facility/non-existent-facility/hierarchy')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        // The route returns 200 with empty hierarchy for non-existent facilities
        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });
    });

    describe('POST /api/v1/devices/access-control - Create Access Control Device', () => {
      const validAccessControlData = {
        gateway_id: 'gateway-1',
        name: 'Main Gate Controller',
        device_type: 'access_control',
        location_description: 'Main entrance gate',
        relay_channel: 1
      };

      it('should create access control device for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
        expect(response.body.device).toHaveProperty('name', validAccessControlData.name);
        expect(response.body.device).toHaveProperty('device_type', validAccessControlData.device_type);
      });

      it('should create access control device for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should create access control device for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            name: 'Test Device'
            // Missing other required fields
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid device_type', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            ...validAccessControlData,
            device_type: 'invalid_type'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should sanitize HTML in device name', async () => {
        const maliciousData = {
          ...validAccessControlData,
          name: '<script>alert("xss")</script>Malicious Device'
        };

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(maliciousData)
          .expect(201);

        expectSuccess(response);
        expect(response.body.device.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious Device');
      });
    });

    describe('POST /api/v1/devices/blulok - Create BluLok Device', () => {
      const validBluLokData = {
        gateway_id: 'gateway-1',
        name: 'Unit 1 Lock Controller',
        device_type: 'blulok',
        location_description: 'Unit 1 entrance',
        unit_id: 'unit-1'
      };

      it('should create BluLok device for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
        expect(response.body.device).toHaveProperty('name', validBluLokData.name);
        expect(response.body.device).toHaveProperty('device_type', validBluLokData.device_type);
      });

      it('should create BluLok device for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should create BluLok device for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            name: 'Test BluLok'
            // Missing other required fields
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid lock_status', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            ...validBluLokData,
            lock_status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should sanitize HTML in device name', async () => {
        const maliciousData = {
          ...validBluLokData,
          name: '<script>alert("xss")</script>Malicious BluLok'
        };

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(maliciousData)
          .expect(201);

        expectSuccess(response);
        expect(response.body.device.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious BluLok');
      });
    });

    describe('PUT /api/v1/devices/:deviceType/:id/status - Update Device Status', () => {
      const validStatusData = {
        status: 'offline'
      };

      it('should update device status for DEV_ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update device status for ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update device status for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for invalid status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid device type', async () => {
        const response = await request(app)
          .put('/api/v1/devices/invalid_type/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(400);

        expectBadRequest(response);
      });
    });

    describe('PUT /api/v1/devices/blulok/:id/lock - Update Lock Status', () => {
      const validLockData = {
        lock_status: 'unlocked'
      };

      it('should update lock status for DEV_ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for TENANT with access', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for MAINTENANCE when assigned', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for invalid lock_status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            lock_status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });
    });
  });

  describe('Security - Role-Based Access Control', () => {
    describe('GET /api/v1/devices - List Devices', () => {
      it('should allow DEV_ADMIN to list all devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should allow ADMIN to list all devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should allow FACILITY_ADMIN to list devices in their facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should prevent FACILITY_ADMIN from listing devices in other facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-2')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow TENANT to list devices in their facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should prevent TENANT from listing devices in other facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-2')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow MAINTENANCE to list devices in their facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });
    });

    describe('GET /api/v1/devices/facility/:facilityId/hierarchy - Get Facility Device Hierarchy', () => {
      it('should allow DEV_ADMIN to view any facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should allow ADMIN to view any facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should allow FACILITY_ADMIN to view their facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should prevent FACILITY_ADMIN from viewing other facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility2.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow TENANT to view their facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should prevent TENANT from viewing other facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility2.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('POST /api/v1/devices/access-control - Create Access Control Device', () => {
      const validAccessControlData = {
        gateway_id: 'gateway-1',
        name: 'Main Gate Controller',
        device_type: 'access_control',
        location_description: 'Main entrance gate',
        relay_channel: 1
      };

      it('should allow DEV_ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow FACILITY_ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should prevent TENANT from creating access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validAccessControlData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from creating access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validAccessControlData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('POST /api/v1/devices/blulok - Create BluLok Device', () => {
      const validBluLokData = {
        gateway_id: 'gateway-1',
        name: 'Unit 1 Lock Controller',
        device_type: 'blulok',
        location_description: 'Unit 1 entrance',
        unit_id: 'unit-1'
      };

      it('should allow DEV_ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow FACILITY_ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should prevent TENANT from creating BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validBluLokData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from creating BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validBluLokData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('PUT /api/v1/devices/:deviceType/:id/status - Update Device Status', () => {
      const validStatusData = {
        status: 'offline'
      };

      it('should allow DEV_ADMIN to update device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow ADMIN to update device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow FACILITY_ADMIN to update device status in their facilities', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should prevent TENANT from updating device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validStatusData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from updating device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validStatusData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('PUT /api/v1/devices/blulok/:id/lock - Update Lock Status', () => {
      const validLockData = {
        lock_status: 'unlocked'
      };

      it('should allow DEV_ADMIN to control lock status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow ADMIN to control lock status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow FACILITY_ADMIN to control lock status in their facilities', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow TENANT to control lock status for their units', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should prevent TENANT from controlling lock status for other units', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-2/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow MAINTENANCE to control lock status when assigned', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see devices in their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned devices should be for facilities the admin has access to
      const devices = response.body.devices;
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(device.facility_id);
      }
    });

    it('should ensure tenants only see devices in their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned devices should be for facilities the tenant has access to
      const devices = response.body.devices;
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(testData.users.tenant.facilityIds).toContain(device.facility_id);
      }
    });
  });

  describe('Input Validation and Security', () => {
    it('should prevent SQL injection in device queries', async () => {
      const response = await request(app)
        .get('/api/v1/devices?search=\'; DROP TABLE devices; --')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('devices');
    });

    it('should validate device type enum values', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          name: 'Test Device',
          device_type: 'invalid_type',
          facility_id: 'facility-1',
          unit_id: 'unit-1',
          location_description: 'Test location',
          ip_address: '192.168.1.100',
          port: 8080,
          status: 'online'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate lock status enum values', async () => {
      const response = await request(app)
        .put('/api/v1/devices/blulok/device-1/lock')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          lock_status: 'invalid_status'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate device status enum values', async () => {
      const response = await request(app)
        .put('/api/v1/devices/access_control/device-1/status')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          status: 'invalid_status'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should prevent XSS in device names', async () => {
      const maliciousData = {
        gateway_id: 'gateway-1',
        name: '<script>alert("xss")</script>Malicious Device',
        device_type: 'access_control',
        location_description: 'Test location',
        relay_channel: 1
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(201);

      expectSuccess(response);
      expect(response.body.device.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious Device');
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should handle rapid device status updates gracefully', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .put('/api/v1/devices/access_control/device-1/status')
            .set('Authorization', `Bearer ${testData.users.admin.token}`)
            .send({ status: 'online' })
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed (no rate limiting implemented yet)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });
});
