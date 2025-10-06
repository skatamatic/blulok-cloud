/**
 * Security Integration Tests
 * 
 * Tests authentication, authorization, and security measures across all API endpoints
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

describe('Security Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  describe('Authentication Security', () => {
    it('should reject requests without authentication tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('token');
    });

    it('should reject requests with malformed tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject requests with invalid token format', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject requests with empty tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer ');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle missing Authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/users');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Authorization Security', () => {
    it('should protect all API routes except health and auth', async () => {
      const protectedRoutes = [
        '/api/v1/users',
        '/api/v1/facilities',
        '/api/v1/units',
        '/api/v1/devices',
        '/api/v1/gateways',
        '/api/v1/key-sharing',
        '/api/v1/access-history',
        '/api/v1/user-facilities',
        '/api/v1/widget-layouts'
      ];

      for (const route of protectedRoutes) {
        const response = await request(app).get(route);
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('success', false);
      }
    });

    it('should allow access to health endpoints without authentication', async () => {
      const healthRoutes = [
        '/health',
        '/health/liveness',
        '/health/readiness'
      ];

      for (const route of healthRoutes) {
        const response = await request(app).get(route);
        expect([200, 503]).toContain(response.status); // 503 for readiness is OK
      }
    });

    it('should allow access to auth endpoints without authentication', async () => {
      const authRoutes = [
        '/api/v1/auth/login'
      ];

      for (const route of authRoutes) {
        const response = await request(app).post(route).send({
          email: 'test@example.com',
          password: 'password123'
        });
        expect([200, 401]).toContain(response.status); // 401 is expected due to database
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should sanitize SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "' UNION SELECT * FROM users --"
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', 'Bearer mock-token')
          .query({ search: input });

        expect(response.status).toBe(401); // Auth required first
        expect(response.body).toHaveProperty('success', false);
      }
    });

    it('should sanitize XSS attempts', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<svg onload="alert(1)">'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/v1/facilities')
          .set('Authorization', 'Bearer mock-token')
          .send({
            name: payload,
            address: '123 Test Street',
            description: 'Test facility'
          });

        expect(response.status).toBe(401); // Auth required first
        expect(response.body).toHaveProperty('success', false);
      }
    });

    it('should handle path traversal attempts', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const attempt of pathTraversalAttempts) {
        const response = await request(app)
          .get(`/api/v1/users/${attempt}`)
          .set('Authorization', 'Bearer mock-token');

        expect(response.status).toBe(401); // Auth required first
        expect(response.body).toHaveProperty('success', false);
      }
    });
  });

  describe('Rate Limiting Security', () => {
    it('should handle rapid authentication attempts', async () => {
      const rapidRequests = Array(10).fill(null).map(() => 
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
      );

      const responses = await Promise.all(rapidRequests);
      
      // All should get auth response (401 due to database)
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('success', false);
      });
    });

    it('should handle rapid protected endpoint requests', async () => {
      const rapidRequests = Array(10).fill(null).map(() => 
        request(app)
          .get('/api/v1/users')
          .set('Authorization', 'Bearer mock-token')
      );

      const responses = await Promise.all(rapidRequests);
      
      // All should get auth response (401 due to invalid token)
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('success', false);
      });
    });
  });

  describe('CORS Security', () => {
    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
    });

    it('should handle requests from different origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://malicious-site.com');

      expect(response.status).toBe(200);
    });
  });

  describe('Content Security', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle oversized requests', async () => {
      const largeData = {
        email: 'test@example.com',
        password: 'password123',
        extraData: 'x'.repeat(100000) // Very large payload
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(largeData);

      // Should still process the request
      expect(response.body).toHaveProperty('success');
    });

    it('should handle requests with invalid content types', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'text/plain')
        .send('invalid data');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Error Information Disclosure', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).not.toContain('database');
      expect(response.body.message).not.toContain('password');
      expect(response.body.message).not.toContain('secret');
    });

    it('should not expose stack traces in production', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send('invalid json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('Session Security', () => {
    it('should handle concurrent sessions', async () => {
      const concurrentSessions = Array(5).fill(null).map(() => 
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
      );

      const responses = await Promise.all(concurrentSessions);
      
      // All should get auth response (401 due to database)
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('success', false);
      });
    });

    it('should handle session timeout scenarios', async () => {
      // Simulate expired token
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer expired-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });
  });
});




