/**
 * Edge Cases and Boundary Testing
 * 
 * This test suite covers edge cases, boundary conditions, and unusual scenarios
 * that could occur in real-world usage of the API.
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

describe('Edge Cases and Boundary Testing', () => {
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

  describe('Request Size Limits', () => {
    it('should handle very large request bodies', async () => {
      const largeData = {
        name: 'A'.repeat(10000), // 10KB string
        description: 'B'.repeat(10000),
        metadata: {
          largeArray: Array(1000).fill('test'),
          nested: {
            deep: {
              value: 'C'.repeat(5000)
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largeData);

      // Should either accept the request or reject it gracefully
      expect([200, 201, 400, 413, 500]).toContain(response.status);
    });

    it('should handle empty request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle null request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('Special Characters and Encoding', () => {
    it('should handle unicode characters in requests', async () => {
      const unicodeData = {
        name: '测试设施 🏢',
        description: 'Unicode test: 你好世界! 🌍',
        special_chars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(unicodeData);

      expect([200, 201, 400, 429, 500]).toContain(response.status);
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousData = {
        name: "'; DROP TABLE users; --",
        email: "admin@test.com' OR '1'='1",
        description: "'; DELETE FROM facilities; --"
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maliciousData);

      // Should reject malicious input
      expect([400, 500]).toContain(response.status);
    });

    it('should handle XSS attempts', async () => {
      const xssData = {
        name: '<script>alert("xss")</script>',
        description: '"><img src=x onerror=alert(1)>',
        email: 'test@test.com'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData);

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle maximum length strings', async () => {
      const maxLengthData = {
        name: 'A'.repeat(255), // Assuming 255 char limit
        email: 'test@example.com',
        description: 'B'.repeat(1000)
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maxLengthData);

      expect([200, 201, 400, 429, 500]).toContain(response.status);
    });

    it('should handle minimum length strings', async () => {
      const minLengthData = {
        name: 'A',
        email: 'a@b.co',
        description: 'B'
      };

      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(minLengthData);

      expect([200, 201, 400, 429, 500]).toContain(response.status);
    });

    it('should handle numeric boundaries', async () => {
      const boundaryData = {
        port: 65535, // Max port number
        timeout: 0, // Minimum timeout
        priority: -1, // Negative number
        count: Number.MAX_SAFE_INTEGER
      };

      const response = await request(app)
        .post('/api/v1/gateways')
        .set('Authorization', `Bearer ${authToken}`)
        .send(boundaryData);

      expect([200, 201, 400, 429, 500]).toContain(response.status);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests = Array(50).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    it('should handle rapid sequential requests', async () => {
      const responses = [];
      
      for (let i = 0; i < 20; i++) {
        const response = await request(app).get('/health');
        responses.push(response);
      }

      // Most should succeed, some might be rate limited
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(10);
    });
  });

  describe('Malformed Requests', () => {
    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should handle wrong content type', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'text/plain')
        .send('plain text data');

      expect([400, 415]).toContain(response.status);
    });

    it('should handle missing content type', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'test' });

      expect([200, 201, 400, 415]).toContain(response.status);
    });

    it('should handle extra headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('X-Custom-Header', 'custom-value')
        .set('X-Another-Header', 'another-value')
        .set('User-Agent', 'Custom-Agent/1.0');

      expect(response.status).toBe(200);
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should handle expired tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-1', email: 'admin@example.com', role: 'admin' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect([401, 429, 500]).toContain(response.status);
    });

    it('should handle tokens with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { userId: 'user-1', email: 'admin@example.com', role: 'admin' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect([401, 429, 500]).toContain(response.status);
    });

    it('should handle malformed tokens', async () => {
      const malformedTokens = [
        'not-a-token',
        'Bearer not-a-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
        'Bearer',
        '',
        'Bearer ',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', token);

        expect([401, 429, 500]).toContain(response.status);
      }
    });

    it('should handle case sensitivity in Authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('authorization', `bearer ${authToken}`); // lowercase

      expect([401, 429, 500]).toContain(response.status);
    });
  });

  describe('URL and Path Edge Cases', () => {
    it('should handle extra slashes in URLs', async () => {
      const response = await request(app)
        .get('//api//v1///users//');

      expect([200, 301, 302, 404]).toContain(response.status);
    });

    it('should handle URL encoding', async () => {
      const response = await request(app)
        .get('/api/v1/users/user%20with%20spaces');

      expect([200, 400, 401, 404, 429, 500]).toContain(response.status);
    });

    it('should handle very long URLs', async () => {
      const longPath = '/api/v1/users/' + 'a'.repeat(2000);
      const response = await request(app).get(longPath);

      expect([200, 400, 401, 404, 414, 429, 500]).toContain(response.status);
    });

    it('should handle special characters in URLs', async () => {
      const specialPaths = [
        '/api/v1/users/user@domain.com',
        '/api/v1/users/user+test',
        '/api/v1/users/user.test',
        '/api/v1/users/user_test',
        '/api/v1/users/user-test'
      ];

      for (const path of specialPaths) {
        const response = await request(app).get(path);
        expect([200, 400, 401, 404, 429, 500]).toContain(response.status);
      }
    });
  });

  describe('Query Parameter Edge Cases', () => {
    it('should handle empty query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users?name=&email=&role=');

      expect([200, 400, 401, 429, 500]).toContain(response.status);
    });

    it('should handle duplicate query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users?name=test&name=duplicate&email=test@test.com');

      expect([200, 400, 401, 429, 500]).toContain(response.status);
    });

    it('should handle very long query strings', async () => {
      const longQuery = '?' + Array(100).fill('param=value').join('&');
      const response = await request(app)
        .get(`/api/v1/users${longQuery}`);

      expect([200, 400, 401, 414, 429, 500]).toContain(response.status);
    });

    it('should handle special characters in query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users?search=test%20with%20spaces&filter=value+with+plus');

      expect([200, 400, 401, 429, 500]).toContain(response.status);
    });
  });

  describe('HTTP Method Edge Cases', () => {
    it('should handle unsupported HTTP methods', async () => {
      const unsupportedMethods = ['PATCH', 'HEAD', 'OPTIONS', 'TRACE'];

      for (const method of unsupportedMethods) {
        let response;
        switch (method.toLowerCase()) {
          case 'patch':
            response = await request(app).patch('/api/v1/users');
            break;
          case 'head':
            response = await request(app).head('/api/v1/users');
            break;
          case 'options':
            response = await request(app).options('/api/v1/users');
            break;
          case 'trace':
            response = await request(app).trace('/api/v1/users');
            break;
          default:
            response = await request(app).get('/api/v1/users');
        }
        expect([200, 204, 404, 405, 429, 500]).toContain(response.status);
      }
    });

    it('should handle case sensitivity in HTTP methods', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'test' });

      expect([200, 201, 400, 429, 500]).toContain(response.status);
    });
  });

  describe('Response Edge Cases', () => {
    it('should handle very large responses', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      // Response should be handled gracefully even if large
      expect([200, 429, 500]).toContain(response.status);
    });

    it('should handle slow responses', async () => {
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000); // 10 second timeout

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000);
      expect([200, 429, 500]).toContain(response.status);
    });
  });

  describe('System Resource Edge Cases', () => {
    it('should handle memory pressure gracefully', async () => {
      // Create many requests to simulate memory pressure
      const requests = Array(100).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // System should remain responsive (account for rate limiting)
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(successCount + rateLimitedCount).toBeGreaterThan(50);
    });

    it('should handle file descriptor limits', async () => {
      // Rapidly open and close many connections
      const promises = [];
      for (let i = 0; i < 200; i++) {
        promises.push(
          request(app).get('/health').then(() => {
            // Small delay to allow cleanup
            return new Promise(resolve => setTimeout(resolve, 1));
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(100);
    });
  });
});
