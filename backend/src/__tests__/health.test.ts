import request from 'supertest';
import { createApp } from '../app';
import { setupMockResponse } from './mocks/database.mock';

describe('Health Routes', () => {
  let app: any;

  beforeAll(async () => {
    // Setup mock database responses
    setupMockResponse('users', [{ id: 'user-1', email: 'test@test.com' }]);
    setupMockResponse('facilities', [{ id: 'facility-1', name: 'Test Facility' }]);
    
    app = createApp();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      // Inject build metadata for test
      process.env.COMMIT_SHA = 'abcdef1234567890';
      process.env.BUILD_ID = 'test-build-123';
      process.env.BUILD_URL = 'https://example.com/build/test-build-123';

      const response = await request(app)
        .get('/health');

      if (response.status !== 200) {
        console.log('Health endpoint error:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('version');
      // New metadata fields
      expect(response.body).toHaveProperty('commitSha', 'abcdef1234567890');
      expect(response.body).toHaveProperty('commitShort', 'abcdef1');
      expect(response.body).toHaveProperty('buildId', 'test-build-123');
      expect(response.body).toHaveProperty('buildUrl', 'https://example.com/build/test-build-123');
      expect(response.body).toHaveProperty('service', 'backend');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('GET /health/liveness', () => {
    it('should return liveness probe', async () => {
      const response = await request(app)
        .get('/health/liveness')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/readiness', () => {
    it('should return readiness probe', async () => {
      const response = await request(app)
        .get('/health/readiness');

      if (response.status !== 200) {
        console.log('Readiness endpoint error:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
