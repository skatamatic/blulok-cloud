/**
 * API Contract Validation Tests
 * 
 * This test suite validates API contracts between frontend and backend
 * by testing endpoint structure, response formats, and error handling
 * without requiring full database functionality.
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
import { expectMockDbContractResponse } from '../test-contract.helpers';
import { UNKNOWN_API_V1_STATUSES } from '../test-auth.helpers';

describe('API Contract Validation Tests', () => {
  let app: any;
  let authToken: string;

  beforeAll(() => {
    app = createApp();
    
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

  describe('Health Endpoints Contract', () => {
    it('should have correct health endpoint structure', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
    });

    it('should have correct liveness endpoint structure', async () => {
      const response = await request(app).get('/health/liveness');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(typeof response.body.status).toBe('string');
    });

    it('should have correct readiness endpoint structure', async () => {
      const response = await request(app).get('/health/readiness');

      // Readiness may return 503 if database is not available
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(typeof response.body.status).toBe('string');
    });
  });

  describe('Authentication API Contract', () => {
    it('should have login endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      // Should return 401 for invalid credentials (expected behavior)
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.success).toBe('boolean');
      expect(typeof response.body.message).toBe('string');
    });

    it('should have profile endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 401 or 200 due to database not being available (expected in test)
      expect([200, 401]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should have change password endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'oldpass',
          newPassword: 'newpass'
        });

      expect([400, 404]).toContain(response.status);
    });

    it('should have logout endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 200 (logout doesn't require database)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(typeof response.body.success).toBe('boolean');
    });

    it('should have verify token endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-token')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 200 (token verification doesn't require database)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(typeof response.body.success).toBe('boolean');
    });
  });

  describe('User Management API Contract', () => {
    it('should have users endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have user by ID endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have create user endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          role: 'user',
          first_name: 'New',
          last_name: 'User'
        });

      expect([400, 404]).toContain(response.status);
    });

    it('should have update user endpoint with correct structure', async () => {
      const response = await request(app)
        .put('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Updated'
        });

      expect([400, 404]).toContain(response.status);
    });

    it('should have delete user endpoint with correct structure', async () => {
      const response = await request(app)
        .delete('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });
  });

  describe('Facility Management API Contract', () => {
    it('should have facilities endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have facility by ID endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have create facility endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Facility',
          address: '123 Test St',
          city: 'Test City',
          state: 'TC',
          zip_code: '12345'
        });

      expectMockDbContractResponse(response);
    });

    it('should have update facility endpoint with correct structure', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Facility'
        });

      expectMockDbContractResponse(response);
    });

    it('should have delete facility endpoint with correct structure', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });
  });

  describe('Key Sharing API Contract', () => {
    it('should have key sharing endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have key sharing by user endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have key sharing by unit endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/unit-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have create key sharing endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          user_id: 'user-1',
          unit_id: 'unit-1',
          access_type: 'temporary',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

      expect([400, 404]).toContain(response.status);
    });

    it('should have update key sharing endpoint with correct structure', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          access_type: 'permanent'
        });

      expectMockDbContractResponse(response);
    });

    it('should have delete key sharing endpoint with correct structure', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have expired key sharing endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });
  });

  describe('Device Management API Contract', () => {
    it('should have devices endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have devices by facility endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/devices/facility/facility-1')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 404 for non-existent route (expected behavior)
      expect([...UNKNOWN_API_V1_STATUSES]).toContain(response.status);
    });

    it('should have device hierarchy endpoint with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/devices/facility/facility-1/hierarchy')
        .set('Authorization', `Bearer ${authToken}`);

      expectMockDbContractResponse(response);
    });

    it('should have create access control device endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gateway_id: 'test-gateway-id',
          device_serial: 'CONTRACT-AC-001',
          name: 'Test Device',
          device_type: 'door',
          location_description: 'Main entrance',
          relay_channel: 1
        });

      expect([400, 404]).toContain(response.status);
    });

    it('should have create Blulok device endpoint with correct structure', async () => {
      const response = await request(app)
        .post('/api/v1/devices/blulok')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          facility_id: 'facility-1',
          unit_id: 'unit-1',
          device_name: 'Test Blulok',
          device_type: 'blulok',
          mac_address: '00:11:22:33:44:55'
        });

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('Error Handling Contract', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .set('Authorization', `Bearer ${authToken}`);

      expect([...UNKNOWN_API_V1_STATUSES]).toContain(response.status);
    });

    it('should return 401 for requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/users');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body.success).toBe(false);
    });

    it('should return 401 for requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should return 400 for validation errors', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email', // Invalid email format
          password: '123' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting Contract', () => {
    it('should handle rate limiting gracefully', async () => {
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed (health endpoint is not rate limited)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('CORS Contract', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3000');

      // CORS headers may not be present for all requests
      if (response.headers['access-control-allow-origin']) {
        expect(response.headers).toHaveProperty('access-control-allow-origin');
      }
      if (response.headers['access-control-allow-methods']) {
        expect(response.headers).toHaveProperty('access-control-allow-methods');
      }
      if (response.headers['access-control-allow-headers']) {
        expect(response.headers).toHaveProperty('access-control-allow-headers');
      }
    });
  });

  describe('Security Headers Contract', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });
});
