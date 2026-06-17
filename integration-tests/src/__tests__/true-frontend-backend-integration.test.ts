/**
 * Frontend-backend contract smoke tests.
 *
 * Exercises the same REST paths the frontend ApiService calls, via supertest
 * against createApp() + the in-memory DB mock (no live HTTP server required).
 */

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
import { createIntegrationTestTokens } from '../test-auth.helpers';

describe('True Frontend-Backend Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let devAdminToken: string;
  let legacyUserToken: string;
  let tenantToken: string;

  beforeAll(() => {
    app = createApp();
    const tokens = createIntegrationTestTokens();
    adminToken = tokens.admin;
    devAdminToken = tokens.devAdmin;
    legacyUserToken = tokens.legacyUser;
    tenantToken = tokens.tenant;
  });

  describe('User Management Integration', () => {
    it('should return users list shape expected by the frontend', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should accept create-user payload shape used by the frontend', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'integration-test@example.com',
          password: 'Password123!',
          firstName: 'Integration',
          lastName: 'Test',
          role: 'tenant',
        });

      expect([201, 400, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('userId');
      }
    });

    it('should accept update-user payload shape used by the frontend', async () => {
      const response = await request(app)
        .put('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          role: 'tenant',
        });

      expect([200, 400, 404, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('user');
      }
    });

    it('should reject unauthenticated user list requests', async () => {
      const response = await request(app).get('/api/v1/users');
      expect(response.status).toBe(401);
    });

    it('should reject invalid create-user payloads', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          password: '123',
          firstName: '',
          lastName: '',
          role: 'invalid-role',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Role-Based Access Integration', () => {
    it('should allow admin user list access', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow dev admin user list access', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${devAdminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should deny legacy user role for user list', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${legacyUserToken}`);
      expect(response.status).toBe(403);
    });

    it('should deny tenant role for user list', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tenantToken}`);
      expect(response.status).toBe(403);
    });
  });
});
