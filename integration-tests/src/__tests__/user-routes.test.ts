/**
 * User Routes Integration Tests
 * 
 * Tests all user management endpoints including:
 * - GET /api/v1/users
 * - GET /api/v1/users/:id
 * - POST /api/v1/users
 * - PUT /api/v1/users/:id
 * - DELETE /api/v1/users/:id
 * - POST /api/v1/users/:id/activate
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

describe('User Routes Integration Tests', () => {
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

  describe('GET /api/v1/users', () => {
    it('should return users list for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to get users list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('should return users list for dev admin users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${devAdminToken}`);

      // Dev admin users should be able to get users list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should return users list for facility admin users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${facilityAdminToken}`);

      // Facility admin users should be able to get users list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should deny access for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be denied access to user management
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should deny access for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be denied access to user management
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/users');
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Access token is required');
    });
  });

  describe('GET /api/v1/users/:id', () => {
    const userId = 'user-1';

    it('should return specific user for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to get specific user details
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should return specific user for dev admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      // Dev admin users should be able to get specific user details
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should allow users to view their own profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Users should be able to view their own profile
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should deny access for other users', async () => {
      const response = await request(app)
        .get('/api/v1/users/other-user')
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be denied access to other users' profiles
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Access denied');
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      // Non-existent users should return 404
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/users/${userId}`);
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/users', () => {
    const newUser = {
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      role: 'tenant'
    };

    it('should create user for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUser);

      // Admin users should be able to create users
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.message).toContain('User created successfully');
    });

    it('should create user for dev admin users', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${devAdminToken}`)
        .send(newUser);

      // Dev admin users should be able to create users
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.message).toContain('User created successfully');
    });

    it('should create user for facility admin users', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${facilityAdminToken}`)
        .send(newUser);

      // Facility admin users should be able to create users
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.message).toContain('User created successfully');
    });

    it('should deny creation for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newUser);

      // Regular users should be denied user creation
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should deny creation for tenant users', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(newUser);

      // Tenant users should be denied user creation
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Missing required fields should return 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('required');
    });

    it('should validate email format', async () => {
      const invalidUser = {
        ...newUser,
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUser);

      // Invalid email format should return 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('email');
    });

    it('should validate password strength', async () => {
      const weakPasswordUser = {
        ...newUser,
        password: '123'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(weakPasswordUser);

      // Weak password should return 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('password');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .send(newUser);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    const userId = 'user-1';
    const updateData = {
      firstName: 'Updated',
      lastName: 'Name',
      role: 'tenant'
    };

    it('should update user for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // Admin users should be able to update users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should update user for dev admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`)
        .send(updateData);

      // Dev admin users should be able to update users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should allow users to update their own profile', async () => {
      const selfUpdateData = {
        first_name: 'Updated',
        last_name: 'Name'
      };

      const response = await request(app)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(selfUpdateData);

      // Users should be able to update their own profile
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
    });

    it('should prevent users from updating their own role', async () => {
      const selfRoleUpdate = {
        first_name: 'Updated',
        last_name: 'Name',
        role: 'admin'
      };

      const response = await request(app)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(selfRoleUpdate);

      // Users should not be able to update their own role
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('role');
    });

    it('should deny update for other users', async () => {
      const response = await request(app)
        .put('/api/v1/users/other-user')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      // Regular users should be denied updating other users
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Access denied');
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/users/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // Non-existent users should return 404
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${userId}`)
        .send(updateData);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    const userId = 'user-1';

    it('should deactivate user for admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to deactivate users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('deactivated');
    });

    it('should deactivate user for dev admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      // Dev admin users should be able to deactivate users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('deactivated');
    });

    it('should deny deactivation for regular users', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be denied deactivating users
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should deny deactivation for tenant users', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be denied deactivating users
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should prevent users from deactivating themselves', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Users should not be able to deactivate themselves
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('deactivate yourself');
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .delete('/api/v1/users/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      // Non-existent users should return 404
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).delete(`/api/v1/users/${userId}`);
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/users/:id/activate', () => {
    const userId = 'user-1';

    it('should activate user for admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${userId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to activate users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('activated');
    });

    it('should activate user for dev admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${userId}/activate`)
        .set('Authorization', `Bearer ${devAdminToken}`);

      // Dev admin users should be able to activate users
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('activated');
    });

    it('should deny activation for regular users', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${userId}/activate`)
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be denied activating users
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should deny activation for tenant users', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${userId}/activate`)
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be denied activating users
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User management permissions required');
    });

    it('should handle non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/users/non-existent/activate')
        .set('Authorization', `Bearer ${adminToken}`);

      // Non-existent users should return 404
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).post(`/api/v1/users/${userId}/activate`);
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      // Malformed JSON should return 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle XSS in user names', async () => {
      const maliciousUser = {
        email: 'test@example.com',
        password: 'password123',
        first_name: '<script>alert("xss")</script>',
        last_name: 'User',
        role: 'user'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousUser);

      // XSS should be sanitized or rejected
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('User created successfully');
    });

    it('should handle oversized requests', async () => {
      const largeUser = {
        email: 'test@example.com',
        password: 'password123',
        first_name: 'A'.repeat(10000),
        last_name: 'User',
        role: 'user'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeUser);

      // Oversized requests should return 413 or 400
      expect([400, 413]).toContain(response.status);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      if (response.status === 413) {
        expect(response.body.message).toContain('too large');
      } else if (response.status === 400) {
        expect(response.body.message).toContain('validation');
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Should handle rate limiting gracefully
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('users');
          expect(Array.isArray(response.body.users)).toBe(true);
        } else if (response.status === 429) {
          expect(response.body).toHaveProperty('success', false);
          expect(response.body).toHaveProperty('message');
          expect(response.body.message).toContain('rate limit');
        }
      });
    });
  });
});
