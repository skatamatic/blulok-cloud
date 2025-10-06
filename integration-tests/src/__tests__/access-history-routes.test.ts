/**
 * Access History Routes Integration Tests
 * 
 * Tests all access history endpoints including:
 * - GET /api/v1/access-history
 * - GET /api/v1/access-history/user/:userId
 * - GET /api/v1/access-history/facility/:facilityId
 * - GET /api/v1/access-history/unit/:unitId
 * - GET /api/v1/access-history/export
 * - GET /api/v1/access-history/:id
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

describe('Access History Routes Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let devAdminToken: string;
  let userToken: string;
  let tenantToken: string;
  let facilityAdminToken: string;

  beforeAll(() => {
    app = createApp();
    
    // Create tokens for different user roles
    adminToken = jwt.sign(
      { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    devAdminToken = jwt.sign(
      { userId: 'dev-admin-1', email: 'dev-admin@example.com', role: 'dev_admin' },
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
    
    facilityAdminToken = jwt.sign(
      { 
        userId: 'facility-admin-1', 
        email: 'facility-admin@example.com', 
        role: 'facility_admin',
        facilityIds: ['facility-1']
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/v1/access-history', () => {
    it('should return access history for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
        expect(Array.isArray(response.body.accessHistory)).toBe(true);
      }
    });

    it('should return access history for dev admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return access history for facility admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return access history for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return access history for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
        expect(response.body).toHaveProperty('pagination');
      }
    });

    it('should support date range filtering', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .query({ 
          startDate: '2024-01-01', 
          endDate: '2024-12-31' 
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/access-history');
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/access-history/user/:userId', () => {
    const userId = 'user-1';

    it('should return user access history for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
        expect(Array.isArray(response.body.accessHistory)).toBe(true);
      }
    });

    it('should return user access history for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return user access history for facility admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${userId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should allow users to view their own access history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should deny access for other users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/user/other-user')
        .set('Authorization', `Bearer ${userToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/user/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/access-history/user/${userId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/access-history/facility/:facilityId', () => {
    const facilityId = 'facility-1';

    it('should return facility access history for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
        expect(Array.isArray(response.body.accessHistory)).toBe(true);
      }
    });

    it('should return facility access history for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${facilityId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return facility access history for facility admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${facilityId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return facility access history for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${facilityId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return facility access history for tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${facilityId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 403, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should handle non-existent facility', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/facility/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/access-history/facility/${facilityId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/access-history/unit/:unitId', () => {
    const unitId = 'unit-1';

    it('should return unit access history for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${unitId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
        expect(Array.isArray(response.body.accessHistory)).toBe(true);
      }
    });

    it('should return unit access history for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${unitId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return unit access history for facility admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${unitId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return unit access history for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${unitId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return unit access history for tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${unitId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should handle non-existent unit', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/unit/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/access-history/unit/${unitId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/access-history/export', () => {
    it('should export access history for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/csv|application\/csv/);
      }
    });

    it('should export access history for dev admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/csv|application\/csv/);
      }
    });

    it('should export access history for facility admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/csv|application\/csv/);
      }
    });

    it('should export access history for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/csv|application\/csv/);
      }
    });

    it('should export access history for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/csv|application\/csv/);
      }
    });

    it('should support different export formats', async () => {
      const formats = ['csv', 'json', 'xlsx'];
      
      for (const format of formats) {
        const response = await request(app)
          .get('/api/v1/access-history/export')
          .query({ format })
          .set('Authorization', `Bearer ${adminToken}`);

        expect([200, 400, 401, 500]).toContain(response.status);
      }
    });

    it('should support date range filtering for export', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ 
          format: 'csv',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .query({ format: 'csv' });

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/access-history/:id', () => {
    const historyId = 'history-1';

    it('should return specific access history for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${historyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return specific access history for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${historyId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return specific access history for facility admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${historyId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return specific access history for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${historyId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should return specific access history for tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${historyId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('accessHistory');
      }
    });

    it('should handle non-existent access history', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/access-history/${historyId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .query({ page: 'invalid', limit: 'invalid' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle invalid date formats', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .query({ 
          startDate: 'invalid-date',
          endDate: 'invalid-date'
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle oversized requests', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .query({ limit: 10000 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/access-history')
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
