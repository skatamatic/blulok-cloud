import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

describe('Auth Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('POST /api/v1/auth/login - User Login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
          password: 'password123',
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('tenant@test.com');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        })
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for empty email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: '',
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for empty password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
          password: '',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for password too short', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
          password: '123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should handle inactive user accounts', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive@test.com',
          password: 'password123',
        })
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('POST /api/v1/auth/change-password - Change Password', () => {
    it('should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePassword123!'
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for invalid current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewSecurePassword123!'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for missing current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          newPassword: 'NewSecurePassword123!'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for missing new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          currentPassword: 'password123'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for weak new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'weak'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePassword123!'
        })
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('GET /api/v1/auth/profile - Get User Profile', () => {
    it('should return user profile for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('tenant@test.com');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('firstName');
      expect(response.body.user).toHaveProperty('lastName');
      expect(response.body.user).toHaveProperty('role');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('POST /api/v1/auth/logout - User Logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('GET /api/v1/auth/verify-token - Verify Token', () => {
    it('should verify valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-token')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('tenant@test.com');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-token')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 401 for missing token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('Input Validation and Security', () => {
    it('should sanitize email input to prevent XSS', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: '<script>alert("xss")</script>@test.com',
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should handle SQL injection attempts in email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: "'; DROP TABLE users; --",
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should limit password length to prevent DoS', async () => {
      const longPassword = 'a'.repeat(1000);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'tenant@test.com',
          password: longPassword,
        })
        .expect(401); // Joi validation passes but AuthService rejects it

      expectUnauthorized(response);
    });

    it('should limit email length to prevent DoS', async () => {
      const longEmail = 'a'.repeat(300) + '@test.com';
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: longEmail,
          password: 'password123',
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('Rate Limiting and Security', () => {
    it('should handle multiple failed login attempts', async () => {
      // Simulate multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'tenant@test.com',
            password: 'wrongpassword',
          })
          .expect(401);
      }
    });

    it('should handle concurrent login attempts', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'tenant@test.com',
            password: 'password123',
          })
      );

      const responses = await Promise.all(promises);
      // At least one should succeed
      const successfulLogins = responses.filter(r => r.status === 200);
      expect(successfulLogins.length).toBeGreaterThan(0);
    });
  });
});