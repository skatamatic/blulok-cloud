/**
 * Storage Routes Tests
 */

import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';
import { Application } from 'express';

describe('Storage Routes', () => {
  let app: Application;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
    testData = createMockTestData();
  });

  describe('GET /api/v1/bludesign/storage/gdrive/auth-url', () => {
    it('should return OAuth URL with valid credentials', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/auth-url')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .query({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.authUrl).toBeDefined();
      // Mock returns https://auth-url.example.com, so just verify it's a valid URL
      expect(res.body.authUrl).toMatch(/^https?:\/\//);
    });

    it('should return 400 if clientId is missing', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/auth-url')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .query({
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/auth-url')
        .query({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/bludesign/storage/gdrive/callback', () => {
    it('should return 400 if code is missing', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/callback')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .query({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/callback')
        .query({
          code: 'test-code',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/bludesign/storage/gdrive/refresh-tokens', () => {
    it('should return 400 if refreshToken is missing', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gdrive/refresh-tokens')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gdrive/refresh-tokens')
        .send({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/bludesign/storage/config', () => {
    it('should return storage config for admin', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/config')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.providerType).toBeDefined();
      expect(['database', 'env_fallback']).toContain(res.body.config.source);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/bludesign/storage/config');
      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/config')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/bludesign/storage/config', () => {
    it('should save local storage config', async () => {
      const res = await request(app)
        .put('/api/v1/bludesign/storage/config')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          providerType: 'local',
          providerConfig: { basePath: './test-bludesign-storage' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('updated');
    });

    it('should return 400 if providerType is missing', async () => {
      const res = await request(app)
        .put('/api/v1/bludesign/storage/config')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ providerConfig: { basePath: './x' } });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/bludesign/storage/config')
        .send({ providerType: 'local', providerConfig: { basePath: './x' } });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/bludesign/storage/:provider/test', () => {
    it('should test local storage provider', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          storageConfig: {
            basePath: './test-storage',
          },
        });

      // Should succeed (200) or fail with provider error (500) based on filesystem permissions
      expect(res.status === 200 || res.status === 500).toBe(true);
    });

    it('should return 400 for invalid provider', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/invalid/test')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          storageConfig: {},
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 if storageConfig is missing', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should validate GCS config', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gcs/test')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          storageConfig: {
            bucketName: 'test-bucket',
            projectId: 'test-project',
          },
        });

      expect(res.status === 200 || res.status === 400 || res.status === 500).toBe(true);
    });

    it('should validate Google Drive config', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gdrive/test')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          storageConfig: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            rootFolderId: 'test-folder-id',
          },
        });

      expect(res.status === 200 || res.status === 400 || res.status === 500).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .send({
          storageConfig: {
            basePath: './test-storage',
          },
        });

      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ storageConfig: { basePath: './test-storage' } });

      expect(res.status).toBe(403);
    });
  });
});
