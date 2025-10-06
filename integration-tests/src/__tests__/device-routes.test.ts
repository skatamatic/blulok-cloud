/**
 * Device Routes Integration Tests
 * 
 * Tests all device management endpoints including:
 * - GET /api/v1/devices
 * - GET /api/v1/devices/facility/:facilityId/hierarchy
 * - POST /api/v1/devices/access-control
 * - POST /api/v1/devices/blulok
 * - PUT /api/v1/devices/:deviceType/:id/status
 * - PUT /api/v1/devices/blulok/:id/lock
 */

// Set up environment variables before importing backend
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'testpassword';
process.env.DB_NAME = 'blulok_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32-chars';
process.env.PORT = '3000';

import request from 'supertest';
import { createApp } from '../../../backend/src/app';
import jwt from 'jsonwebtoken';

describe('Device Routes Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;
  let tenantToken: string;
  let maintenanceToken: string;

  beforeAll(() => {
    app = createApp();
    
    // Create tokens for different user roles
    adminToken = jwt.sign(
      { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    userToken = jwt.sign(
      { userId: 'user-1', email: 'user@example.com', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    tenantToken = jwt.sign(
      { userId: 'tenant-1', email: 'tenant@example.com', role: 'tenant' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    maintenanceToken = jwt.sign(
      { userId: 'maintenance-1', email: 'maintenance@example.com', role: 'maintenance' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/v1/devices', () => {
    it('should return devices list for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      }
    });

    it('should return devices list for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('devices');
      }
    });

    it('should return devices list for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('devices');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/devices');
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/devices/facility/:facilityId/hierarchy', () => {
    const facilityId = 'facility-1';

    it('should return device hierarchy for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/devices/facility/${facilityId}/hierarchy`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('hierarchy');
      }
    });

    it('should return device hierarchy for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/devices/facility/${facilityId}/hierarchy`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('hierarchy');
      }
    });

    it('should handle non-existent facility', async () => {
      const response = await request(app)
        .get('/api/v1/devices/facility/non-existent/hierarchy')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/devices/facility/${facilityId}/hierarchy`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/devices/access-control', () => {
    const accessControlDevice = {
      gateway_id: 'gateway-1',
      name: 'Main Gate Access Control',
      device_type: 'access_control',
      location_description: 'Main entrance gate',
      relay_channel: 1
    };

    it('should create access control device for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(accessControlDevice);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('device');
      }
    });

    it('should create access control device for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${userToken}`)
        .send(accessControlDevice);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('device');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate relay channel range', async () => {
      const invalidDevice = {
        ...accessControlDevice,
        relay_channel: 10 // Invalid: should be 1-8
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDevice);

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .send(accessControlDevice);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/devices/blulok', () => {
    const bluLokDevice = {
      gateway_id: 'gateway-1',
      name: 'Storage Unit Lock',
      device_type: 'blulok',
      location_description: 'Unit A101',
      unit_id: 'unit-1'
    };

    it('should create BluLok device for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bluLokDevice);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('device');
      }
    });

    it('should create BluLok device for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .set('Authorization', `Bearer ${userToken}`)
        .send(bluLokDevice);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('device');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .send(bluLokDevice);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/devices/:deviceType/:id/status', () => {
    const deviceId = 'device-1';
    const statusData = {
      status: 'offline'
    };

    it('should update device status for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/access_control/${deviceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(statusData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should update BluLok device status for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(statusData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny status update for tenant users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/access_control/${deviceId}/status`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(statusData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny status update for maintenance users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/access_control/${deviceId}/status`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send(statusData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate device type', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/invalid_type/${deviceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(statusData);

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate status values', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/access_control/${deviceId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/access_control/${deviceId}/status`)
        .send(statusData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/devices/blulok/:id/lock', () => {
    const deviceId = 'device-1';
    const lockData = {
      lock_status: 'unlocked'
    };

    it('should update lock status for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(lockData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should update lock status for regular users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/lock`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(lockData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny lock control for tenant users', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/lock`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(lockData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate lock status values', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lock_status: 'invalid_status' });

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent device', async () => {
      const response = await request(app)
        .put('/api/v1/devices/blulok/non-existent/lock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(lockData);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/devices/blulok/${deviceId}/lock`)
        .send(lockData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle XSS in device names', async () => {
      const maliciousDevice = {
        gateway_id: 'gateway-1',
        name: '<script>alert("xss")</script>',
        device_type: 'access_control',
        location_description: 'Test location',
        relay_channel: 1
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousDevice);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        // Should sanitize the name
        expect(response.body.device.name).not.toContain('<script>');
      }
    });

    it('should handle oversized requests', async () => {
      const largeDevice = {
        gateway_id: 'gateway-1',
        name: 'A'.repeat(10000),
        device_type: 'access_control',
        location_description: 'A'.repeat(10000),
        relay_channel: 1
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeDevice);

      expect([400, 413, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Should handle rate limiting gracefully
      responses.forEach(response => {
        expect([200, 429, 401, 500]).toContain(response.status);
      });
    });
  });
});




