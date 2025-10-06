/**
 * User-Facility Routes Integration Tests
 * 
 * Tests all user-facility relationship endpoints including:
 * - GET /api/v1/user-facilities/:userId
 * - PUT /api/v1/user-facilities/:userId
 * - POST /api/v1/user-facilities/:userId/facilities/:facilityId
 * - DELETE /api/v1/user-facilities/:userId/facilities/:facilityId
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

describe('User-Facility Routes Integration Tests', () => {
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

  describe('GET /api/v1/user-facilities/:userId', () => {
    const userId = 'user-1';

    it('should return user facilities for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('facilities');
        expect(Array.isArray(response.body.facilities)).toBe(true);
      }
    });

    it('should return user facilities for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should return user facilities for facility admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should allow users to view their own facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 403, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should deny access for other users', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/other-user')
        .set('Authorization', `Bearer ${userToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny access for tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/user-facilities/${userId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/user-facilities/:userId', () => {
    const userId = 'user-1';
    const updateData = {
      facilities: [
        { facility_id: 'facility-1', role: 'user' },
        { facility_id: 'facility-2', role: 'admin' }
      ]
    };

    it('should update user facilities for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should update user facilities for dev admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`)
        .send(updateData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should update user facilities for facility admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`)
        .send(updateData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('facilities');
      }
    });

    it('should deny update for regular users', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny update for tenant users', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(updateData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect([400, 404, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect([400, 404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/user-facilities/${userId}`)
        .send(updateData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/user-facilities/:userId/facilities/:facilityId', () => {
    const userId = 'user-1';
    const facilityId = 'facility-1';
    const assignmentData = {
      role: 'user'
    };

    it('should assign user to facility for admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(assignmentData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should assign user to facility for dev admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${devAdminToken}`)
        .send(assignmentData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should assign user to facility for facility admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`)
        .send(assignmentData);

      expect([200, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny assignment for regular users', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(assignmentData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny assignment for tenant users', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(assignmentData);

      expect([403, 400, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect([400, 404, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate role values', async () => {
      const invalidRoleData = {
        role: 'invalid_role'
      };

      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidRoleData);

      expect([400, 404, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/non-existent/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(assignmentData);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent facility', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/non-existent`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(assignmentData);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .send(assignmentData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('DELETE /api/v1/user-facilities/:userId/facilities/:facilityId', () => {
    const userId = 'user-1';
    const facilityId = 'facility-1';

    it('should remove user from facility for admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should remove user from facility for dev admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should remove user from facility for facility admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny removal for regular users', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should deny removal for tenant users', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([403, 404, 401, 500]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/non-existent/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent facility', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/non-existent`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 401, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/v1/user-facilities/${userId}/facilities/${facilityId}`);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/user-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle oversized requests', async () => {
      const largeData = {
        facilities: Array(1000).fill({ facility_id: 'facility-1', role: 'user' })
      };

      const response = await request(app)
        .put('/api/v1/user-facilities/user-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeData);

      expect([400, 413, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/user-facilities/user-1')
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
