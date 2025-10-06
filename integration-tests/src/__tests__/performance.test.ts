/**
 * Performance and Load Testing
 * 
 * Tests API performance, response times, and concurrent request handling
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

describe('Performance Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  describe('Response Time Testing', () => {
    it('should respond to health checks within acceptable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health');

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should respond to liveness probe quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health/liveness');

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500); // Should respond within 500ms
    });

    it('should handle auth requests within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(401); // Expected due to database
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent health checks', async () => {
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request(app).get('/health')
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(5000); // All 10 requests within 5 seconds
    });

    it('should handle concurrent auth requests', async () => {
      const concurrentRequests = 5;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should get auth response (401 due to database)
      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('success', false);
      });

      // Should handle concurrent auth requests efficiently
      expect(totalTime).toBeLessThan(10000); // All 5 requests within 10 seconds
    });

    it('should handle mixed concurrent requests', async () => {
      const requests = [
        request(app).get('/health'),
        request(app).get('/health/liveness'),
        request(app).get('/health/readiness'),
        request(app).post('/api/v1/auth/login').send({
          email: 'test@example.com',
          password: 'password123'
        }),
        request(app).get('/api/v1/users').set('Authorization', 'Bearer mock-token')
      ];

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // Health endpoints should succeed
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      
      // Auth and protected endpoints should fail as expected
      expect(responses[3].status).toBe(401);
      expect(responses[4].status).toBe(401);

      // Should handle mixed requests efficiently
      expect(totalTime).toBeLessThan(5000);
    });
  });

  describe('Memory Usage Testing', () => {
    it('should not leak memory with repeated requests', async () => {
      const initialMemory = process.memoryUsage();
      
      // Make many requests
      for (let i = 0; i < 50; i++) {
        await request(app).get('/health');
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle 404 errors quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/non-existent-endpoint');

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(404);
      expect(responseTime).toBeLessThan(1000); // Should respond quickly
    });

    it('should handle malformed requests quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send('invalid json');

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(400);
      expect(responseTime).toBeLessThan(1000); // Should respond quickly
    });
  });

  describe('Load Testing Simulation', () => {
    it('should handle burst of requests', async () => {
      const burstSize = 20;
      const requests = Array(burstSize).fill(null).map(() => 
        request(app).get('/health')
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // Accept both 200 (success) and 429 (rate limited) as valid responses
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });

      // Should have some successful responses
      const successfulResponses = responses.filter(r => r.status === 200).length;
      expect(successfulResponses).toBeGreaterThan(0);

      // Should handle burst efficiently
      expect(totalTime).toBeLessThan(10000); // All 20 requests within 10 seconds
    });

    it('should maintain performance under sustained load', async () => {
      const sustainedRequests = 100;
      const requestPromises = [];

      for (let i = 0; i < sustainedRequests; i++) {
        requestPromises.push(
          request(app).get('/health').then(response => {
            // Accept both 200 (success) and 429 (rate limited) as valid responses
            expect([200, 429]).toContain(response.status);
            return response;
          })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(requestPromises);
      const totalTime = Date.now() - startTime;

      // Count successful responses (200) vs rate limited (429)
      const successfulResponses = responses.filter(r => r.status === 200).length;
      const rateLimitedResponses = responses.filter(r => r.status === 429).length;

      // Should have some successful responses
      expect(successfulResponses).toBeGreaterThan(0);
      
      // Should handle sustained load efficiently
      expect(totalTime).toBeLessThan(30000); // All 100 requests within 30 seconds
      
      // Log the distribution for debugging
      console.log(`Load test results: ${successfulResponses} successful, ${rateLimitedResponses} rate limited`);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources after requests', async () => {
      // Make several requests
      for (let i = 0; i < 10; i++) {
        await request(app).get('/health');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Memory should not continuously grow (allow for more memory in test environment)
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    });
  });
});
