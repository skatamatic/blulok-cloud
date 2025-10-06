/**
 * Full API Integration Tests with Database Mocking
 * 
 * This test suite covers all API endpoints with mocked database layer
 * to ensure complete API contract validation without requiring a real database.
 */

// Set up environment variables and mocks before importing backend
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'testpassword';
process.env.DB_NAME = 'blulok_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32-chars';
process.env.PORT = '3000';

// Import mocks first
import '../setup-mocks';
import { setupTestData, cleanupTestData, getMockData, addMockData } from '../setup-mocks';

import request from 'supertest';
import { createApp } from '../../../backend/src/app';
import jwt from 'jsonwebtoken';

describe('Full API Integration Tests with Database Mocking', () => {
  let app: any;
  let authToken: string;

  beforeAll(() => {
    app = createApp();
    setupTestData();
    
    // Create a valid JWT token for authenticated requests
    authToken = jwt.sign(
      { 
        userId: 'user-1', 
        email: 'admin@example.com', 
        role: 'admin' 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  afterAll(() => {
    cleanupTestData();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return liveness probe', async () => {
      const response = await request(app).get('/health/liveness');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'alive');
    });

    it('should return readiness probe', async () => {
      const response = await request(app).get('/health/readiness');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
    });
  });

  describe('Authentication API', () => {
    it('should handle login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should reject login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle profile request with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should reject profile request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle change password request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle logout request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should verify token validity', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-token')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('User Management API', () => {
    it('should get all users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should get user by ID', async () => {
      const response = await request(app)
        .get('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should create new user', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'password123',
        role: 'user',
        first_name: 'New',
        last_name: 'User'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(newUser.email);
    });

    it('should update user', async () => {
      const updateData = {
        first_name: 'Updated',
        last_name: 'Name'
      };

      const response = await request(app)
        .put('/api/v1/users/user-2')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should delete user', async () => {
      // First create a user to delete
      const newUser = {
        email: 'todelete@example.com',
        password: 'password123',
        role: 'user',
        first_name: 'To',
        last_name: 'Delete'
      };

      const createResponse = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newUser);

      const userId = createResponse.body.user.id;

      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Facility Management API', () => {
    it('should get all facilities', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('facilities');
      expect(Array.isArray(response.body.facilities)).toBe(true);
    });

    it('should get facility by ID', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('facility');
    });

    it('should create new facility', async () => {
      const newFacility = {
        name: 'New Facility',
        address: '789 New St',
        city: 'New City',
        state: 'NC',
        zip_code: '54321'
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newFacility);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('facility');
      expect(response.body.facility.name).toBe(newFacility.name);
    });

    it('should update facility', async () => {
      const updateData = {
        name: 'Updated Facility Name'
      };

      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('facility');
    });

    it('should delete facility', async () => {
      // First create a facility to delete
      const newFacility = {
        name: 'To Delete Facility',
        address: '999 Delete St',
        city: 'Delete City',
        state: 'DC',
        zip_code: '99999'
      };

      const createResponse = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newFacility);

      const facilityId = createResponse.body.facility.id;

      const response = await request(app)
        .delete(`/api/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Unit Management API', () => {
    it('should get units by facility', async () => {
      const response = await request(app)
        .get('/api/v1/units/facility/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should get unit by ID', async () => {
      const response = await request(app)
        .get('/api/v1/units/unit-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
    });

    it('should create new unit', async () => {
      const newUnit = {
        facility_id: 'facility-1',
        unit_number: 'B-201',
        size: '10x20',
        is_occupied: false
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newUnit);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit.unit_number).toBe(newUnit.unit_number);
    });

    it('should update unit', async () => {
      const updateData = {
        is_occupied: true
      };

      const response = await request(app)
        .put('/api/v1/units/unit-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
    });

    it('should assign unit to tenant', async () => {
      const response = await request(app)
        .post('/api/v1/units/unit-1/assign/user-2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should unassign unit from tenant', async () => {
      const response = await request(app)
        .delete('/api/v1/units/unit-1/assign/user-2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Device Management API', () => {
    it('should get all devices', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('devices');
      expect(Array.isArray(response.body.devices)).toBe(true);
    });

    it('should get devices by facility', async () => {
      const response = await request(app)
        .get('/api/v1/devices/facility/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('devices');
    });

    it('should get device hierarchy', async () => {
      const response = await request(app)
        .get('/api/v1/devices/facility/facility-1/hierarchy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('hierarchy');
    });

    it('should create access control device', async () => {
      const newDevice = {
        facility_id: 'facility-1',
        unit_id: 'unit-1',
        device_name: 'New Access Control',
        device_type: 'access_control',
        relay_channel: 1
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newDevice);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('device');
    });

    it('should create Blulok device', async () => {
      const newDevice = {
        facility_id: 'facility-1',
        unit_id: 'unit-1',
        device_name: 'New Blulok Device',
        device_type: 'blulok',
        mac_address: '00:11:22:33:44:55'
      };

      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newDevice);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('device');
    });

    it('should update device status', async () => {
      const response = await request(app)
        .put('/api/v1/devices/access_control/device-1/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'offline' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should control Blulok device', async () => {
      const response = await request(app)
        .put('/api/v1/devices/blulok/device-2/lock')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'lock' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Gateway Management API', () => {
    it('should get all gateways', async () => {
      const response = await request(app)
        .get('/api/v1/gateways')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('gateways');
      expect(Array.isArray(response.body.gateways)).toBe(true);
    });

    it('should create new gateway', async () => {
      const newGateway = {
        facility_id: 'facility-1',
        gateway_name: 'New Gateway',
        ip_address: '192.168.1.200',
        port: 8080
      };

      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newGateway);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('gateway');
    });

    it('should update gateway status', async () => {
      const response = await request(app)
        .put('/api/v1/gateways/gateway-1/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'offline' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Key Sharing API', () => {
    it('should get all key sharing records', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sharing');
      expect(Array.isArray(response.body.sharing)).toBe(true);
    });

    it('should get key sharing by user', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/user-2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sharing');
    });

    it('should get key sharing by unit', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/unit-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sharing');
    });

    it('should create new key sharing', async () => {
      const newSharing = {
        user_id: 'user-2',
        unit_id: 'unit-2',
        access_type: 'temporary',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSharing);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('id');
    });

    it('should update key sharing', async () => {
      const updateData = {
        access_type: 'permanent'
      };

      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should delete key sharing', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should get expired key sharing records', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sharing');
    });
  });

  describe('Access History API', () => {
    it('should get all access history', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('history');
      expect(Array.isArray(response.body.history)).toBe(true);
    });

    it('should get access history by user', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/user/user-2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('history');
    });

    it('should get access history by facility', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/facility/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('history');
    });

    it('should get access history by unit', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/unit/unit-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('history');
    });

    it('should export access history', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  describe('User Facilities API', () => {
    it('should get user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('facilities');
    });

    it('should assign user to facility', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/user-2/facilities/facility-2')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ role: 'user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should remove user from facility', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/user-2/facilities/facility-2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Widget Layouts API', () => {
    it('should get user widget layouts', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('layouts');
    });

    it('should create widget layout', async () => {
      const newLayout = {
        widget_type: 'unit_status',
        position_x: 4,
        position_y: 0,
        width: 2,
        height: 2
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newLayout);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('layout');
    });

    it('should update widget layout', async () => {
      const updateData = {
        position_x: 6,
        position_y: 0
      };

      const response = await request(app)
        .put('/api/v1/widget-layouts/widget-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should show/hide widget', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/widget-1/show')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should reset widget layouts', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should get widget templates', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('templates');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 for requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/users');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 401 for requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 400 for malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should return 422 for validation errors', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email', // Invalid email format
          password: '123' // Too short
        });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // Some requests should succeed, others might be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });
});




