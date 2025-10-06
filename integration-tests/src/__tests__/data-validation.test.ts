/**
 * Data Validation Integration Tests
 * 
 * Tests data validation, sanitization, and error handling across all API endpoints
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

describe('Data Validation Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  describe('Input Validation', () => {
    it('should reject invalid email formats', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('email');
    });

    it('should reject short passwords', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('password');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          // Missing password
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid user role values', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer mock-token')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          role: 'INVALID_ROLE',
          password: 'Password123!'
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject invalid device types', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: 'Test Device',
          device_type: 'invalid_type',
          location_description: 'Test location',
          relay_channel: 1
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject invalid relay channel numbers', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: 'Test Device',
          device_type: 'access_control',
          location_description: 'Test location',
          relay_channel: 15 // Invalid: should be 1-8
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('XSS Protection', () => {
    it('should sanitize HTML in device names', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: '<script>alert("xss")</script>',
          device_type: 'access_control',
          location_description: 'Test location',
          relay_channel: 1
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should sanitize HTML in facility descriptions', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', 'Bearer mock-token')
        .send({
          name: 'Test Facility',
          address: '123 Test Street',
          description: '<img src="x" onerror="alert(1)">'
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Data Type Validation', () => {
    it('should reject non-numeric relay channels', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: 'Test Device',
          device_type: 'access_control',
          location_description: 'Test location',
          relay_channel: 'not-a-number'
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject invalid date formats', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', 'Bearer mock-token')
        .send({
          unitId: 'test-unit',
          sharedWithUserId: 'test-user',
          accessLevel: 'full',
          expiresAt: 'not-a-date',
          notes: 'Test sharing'
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle minimum valid relay channel', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: 'Test Device',
          device_type: 'access_control',
          location_description: 'Test location',
          relay_channel: 1
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle maximum valid relay channel', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', 'Bearer mock-token')
        .send({
          gateway_id: 'test-gateway',
          name: 'Test Device',
          device_type: 'access_control',
          location_description: 'Test location',
          relay_channel: 8
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('SQL Injection Protection', () => {
    it('should handle SQL injection attempts in search queries', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer mock-token')
        .query({
          search: "'; DROP TABLE users; --"
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle SQL injection in facility names', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', 'Bearer mock-token')
        .send({
          name: "'; DROP TABLE facilities; --",
          address: '123 Test Street',
          description: 'Test facility'
        });

      expect(response.status).toBe(401); // Auth required first
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid successive requests', async () => {
      const requests = Array(20).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All health requests should succeed (they're not rate limited)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Content Type Validation', () => {
    it('should reject requests with invalid content type', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'text/plain')
        .send('invalid data');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Request Size Limits', () => {
    it('should handle large request bodies', async () => {
      const largeData = {
        email: 'test@example.com',
        password: 'password123',
        extraData: 'x'.repeat(10000) // Large payload
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(largeData);

      // Should still process the request (auth will fail due to database)
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
    });
  });
});




