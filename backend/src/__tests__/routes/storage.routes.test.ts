/**
 * Storage Routes Tests
 */

import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { testData } from '../test-data';

const app = createApp();

describe('Storage Routes', () => {
  beforeAll(async () => {
    await DatabaseService.getInstance().connect();
  });

  afterAll(async () => {
    await DatabaseService.getInstance().disconnect();
  });

  describe('GET /api/v1/bludesign/storage/gdrive/auth-url', () => {
    it('should return OAuth URL with valid credentials', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/auth-url')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .query({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.authUrl).toBeDefined();
      expect(res.body.authUrl).toContain('accounts.google.com');
    });

    it('should return 400 if clientId is missing', async () => {
      const res = await request(app)
        .get('/api/v1/bludesign/storage/gdrive/auth-url')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
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
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
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
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
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

  describe('POST /api/v1/bludesign/storage/:provider/test', () => {
    it('should test local storage provider', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          storageConfig: {
            basePath: './test-storage',
          },
        });

      // Should succeed or fail based on filesystem permissions
      expect([200, 500]).toContain(res.status);
    });

    it('should return 400 for invalid provider', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/invalid/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          storageConfig: {},
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 if storageConfig is missing', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/local/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should validate GCS config', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gcs/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          storageConfig: {
            bucketName: 'test-bucket',
            projectId: 'test-project',
          },
        });

      // Should fail because bucket doesn't exist, but config should be validated
      expect([400, 500]).toContain(res.status);
    });

    it('should validate Google Drive config', async () => {
      const res = await request(app)
        .post('/api/v1/bludesign/storage/gdrive/test')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          storageConfig: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            rootFolderId: 'test-folder-id',
          },
        });

      // Should fail because folder doesn't exist, but config should be validated
      expect([400, 500]).toContain(res.status);
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
  });
});
