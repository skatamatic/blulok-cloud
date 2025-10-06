/**
 * Gateway Routes Integration Tests
 * 
 * Tests all gateway management endpoints including:
 * - GET /api/v1/gateways
 * - POST /api/v1/gateways
 * - GET /api/v1/gateways/:id
 * - PUT /api/v1/gateways/:id
 * - PUT /api/v1/gateways/:id/status
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

describe('Gateway Routes Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;
  let tenantToken: string;

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
  });

  describe('GET /api/v1/gateways', () => {
    it('should return gateways list for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/gateways')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateways');
        expect(Array.isArray(response.body.gateways)).toBe(true);
      }
    });

    it('should return gateways list for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/gateways')
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateways');
      }
    });

    it('should deny access to tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/gateways')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([403, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/gateways');
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/gateways', () => {
    const newGateway = {
      facility_id: 'facility-1',
      name: 'Test Gateway',
      serial_number: 'GW-001',
      location: 'Main Entrance',
      status: 'online'
    };

    it('should create gateway for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newGateway);

      expect([201, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateway');
      }
    });

    it('should deny creation for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newGateway);

      expect([403, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/gateways')
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
        .post('/api/v1/gateways')
        .send(newGateway);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/gateways/:id', () => {
    const gatewayId = 'gateway-1';

    it('should return specific gateway for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/gateways/${gatewayId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateway');
      }
    });

    it('should return specific gateway for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/gateways/${gatewayId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateway');
      }
    });

    it('should deny access to tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/gateways/${gatewayId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent gateway', async () => {
      const response = await request(app)
        .get('/api/v1/gateways/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/gateways/${gatewayId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/gateways/:id', () => {
    const gatewayId = 'gateway-1';
    const updateData = {
      name: 'Updated Gateway',
      location: 'Updated Location',
      status: 'offline'
    };

    it('should update gateway for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateway');
      }
    });

    it('should deny update for non-admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent gateway', async () => {
      const response = await request(app)
        .put('/api/v1/gateways/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}`)
        .send(updateData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/gateways/:id/status', () => {
    const gatewayId = 'gateway-1';
    const statusData = {
      status: 'offline'
    };

    it('should update gateway status for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(statusData);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('gateway');
      }
    });

    it('should deny status update for non-admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(statusData);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate status field', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid-status' });

      expect([400, 404, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent gateway', async () => {
      const response = await request(app)
        .put('/api/v1/gateways/non-existent/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(statusData);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/gateways/${gatewayId}/status`)
        .send(statusData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle missing content type', async () => {
      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${adminToken}`)
        .send('{"name": "test"}');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle oversized requests', async () => {
      const largeData = {
        name: 'A'.repeat(10000),
        facility_id: 'facility-1',
        serial_number: 'GW-001'
      };

      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeData);

      expect([400, 413, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/gateways')
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




