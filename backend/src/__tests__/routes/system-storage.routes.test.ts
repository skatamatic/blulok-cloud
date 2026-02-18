/**
 * System Storage Routes Unit Tests
 *
 * Tests RBAC, validation, and success paths for admin storage configuration endpoints.
 */

import request from 'supertest';
import express from 'express';
import { systemStorageRouter } from '@/routes/system-storage.routes';
import {
  saveFirmwareStorageConfig,
  buildFirmwareStorageProvider,
} from '@/services/firmware/firmware-storage.factory';
import { validateBaseStorageConfig } from '@/services/storage';

// Mock auth middleware – sets req.user from x-test-user header
jest.mock('@/middleware/auth.middleware', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user'] as string) : undefined;
    next();
  },
  requireDevAdmin: (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'dev_admin') {
      return res.status(403).json({ message: 'Dev admin access required' });
    }
    next();
  },
}));

jest.mock('@/services/database.service', () => {
  const firstFn = jest.fn().mockResolvedValue(null);
  const mockDb = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: firstFn,
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  }));
  return {
    DatabaseService: {
      getInstance: jest.fn(() => ({ connection: mockDb })),
    },
    __mockFirst: firstFn,
  };
});

jest.mock('@/services/firmware/firmware-storage.factory', () => ({
  saveFirmwareStorageConfig: jest.fn().mockResolvedValue(undefined),
  buildFirmwareStorageProvider: jest.fn(() => {
    let stored: Buffer | null = null;
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      upload: jest.fn().mockImplementation((_id: string, _fn: string, data: Buffer) => { stored = data; return `firmware/__test__/healthcheck.bin`; }),
      download: jest.fn().mockImplementation(() => stored ? Promise.resolve(Buffer.from(stored)) : Promise.reject(new Error('not found'))),
      remove: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

jest.mock('@/services/storage', () => ({
  validateBaseStorageConfig: jest.fn().mockReturnValue([]),
  StorageProviderType: { LOCAL: 'local', GCS: 'gcs', GDRIVE: 'gdrive' },
}));

const devAdminHeader = JSON.stringify({
  userId: 'admin-1',
  role: 'dev_admin',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
});
const tenantHeader = JSON.stringify({
  userId: 'user-1',
  role: 'tenant',
  email: 'user@test.com',
  firstName: 'Test',
  lastName: 'User',
});

const app = express();
app.use(express.json());
app.use('/api/v1/admin/storage-config', systemStorageRouter);

// Get DB mock helpers (from jest.mock)
const { __mockFirst } = require('@/services/database.service') as { __mockFirst: jest.Mock };

describe('System Storage Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __mockFirst.mockResolvedValue(null);
    (validateBaseStorageConfig as jest.Mock).mockReturnValue([]);
    (saveFirmwareStorageConfig as jest.Mock).mockResolvedValue(undefined);
    (buildFirmwareStorageProvider as jest.Mock).mockImplementation(() => {
      let stored: Buffer | null = null;
      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        upload: jest.fn().mockImplementation((_id: string, _fn: string, data: Buffer) => { stored = data; return `firmware/__test__/healthcheck.bin`; }),
        download: jest.fn().mockImplementation(() => stored ? Promise.resolve(Buffer.from(stored)) : Promise.reject(new Error('not found'))),
        remove: jest.fn().mockResolvedValue(undefined),
      };
    });
  });

  // =========================================================================
  // RBAC
  // =========================================================================

  describe('RBAC', () => {
    it('GET / returns 403 for non-DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/admin/storage-config')
        .set('x-test-user', tenantHeader);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Dev admin access required');
    });

    it('PUT / returns 403 for non-DEV_ADMIN', async () => {
      const response = await request(app)
        .put('/api/v1/admin/storage-config')
        .set('x-test-user', tenantHeader)
        .send({ providerType: 'local', providerConfig: { basePath: '/tmp' } });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Dev admin access required');
    });

    it('POST /test returns 403 for non-DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/admin/storage-config/test')
        .set('x-test-user', tenantHeader)
        .send({ providerType: 'local', providerConfig: { basePath: '/tmp' } });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Dev admin access required');
    });
  });

  // =========================================================================
  // GET /
  // =========================================================================

  describe('GET /', () => {
    it('returns env_fallback config when no DB config exists', async () => {
      __mockFirst.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.config.providerType).toBe('gcs');
      expect(response.body.config.providerConfig.projectId).toBeDefined();
      expect(response.body.config.providerConfig.bucketName).toBeDefined();
      expect(response.body.config.source).toBe('env_fallback');
    });

    it('returns DB config with secrets redacted', async () => {
      __mockFirst
        .mockResolvedValueOnce({ value: 'gdrive' })
        .mockResolvedValueOnce({
          value: JSON.stringify({
            clientId: 'client-123',
            clientSecret: 'secret-456',
            refreshToken: 'refresh-789',
            accessToken: 'access-abc',
            keyFileContents: 'keyfile-xyz',
            rootFolderId: 'folder-1',
          }),
        });

      const response = await request(app)
        .get('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.config.providerType).toBe('gdrive');
      expect(response.body.config.source).toBe('database');

      const cfg = response.body.config.providerConfig;
      expect(cfg.clientSecret).toBe('***');
      expect(cfg.refreshToken).toBe('***');
      expect(cfg.accessToken).toBe('***');
      expect(cfg.keyFileContents).toBe('***');
      expect(cfg.clientId).toBe('client-123');
      expect(cfg.rootFolderId).toBe('folder-1');
    });
  });

  // =========================================================================
  // PUT /
  // =========================================================================

  describe('PUT /', () => {
    it('returns 400 when providerType missing', async () => {
      const response = await request(app)
        .put('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader)
        .send({ providerConfig: { basePath: '/tmp' } });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('providerType and providerConfig are required');
    });

    it('returns 400 for invalid providerType', async () => {
      const response = await request(app)
        .put('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader)
        .send({ providerType: 'invalid', providerConfig: { basePath: '/tmp' } });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid providerType');
    });

    it('returns 400 when validation fails', async () => {
      (validateBaseStorageConfig as jest.Mock).mockReturnValue(['basePath is required']);

      const response = await request(app)
        .put('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader)
        .send({ providerType: 'local', providerConfig: {} });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(['basePath is required']);
    });

    it('saves config successfully and returns 200', async () => {
      const config = { providerType: 'local', providerConfig: { basePath: './storage/firmware' } };

      const response = await request(app)
        .put('/api/v1/admin/storage-config')
        .set('x-test-user', devAdminHeader)
        .send(config);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Firmware storage configuration updated');
      expect(saveFirmwareStorageConfig).toHaveBeenCalledWith('local', { basePath: './storage/firmware' });
    });
  });

  // =========================================================================
  // POST /test
  // =========================================================================

  describe('POST /test', () => {
    it('returns 400 when providerType missing', async () => {
      const response = await request(app)
        .post('/api/v1/admin/storage-config/test')
        .set('x-test-user', devAdminHeader)
        .send({ providerConfig: { basePath: '/tmp' } });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('providerType and providerConfig are required');
    });

    it('returns 400 when validation fails', async () => {
      (validateBaseStorageConfig as jest.Mock).mockReturnValue(['Invalid GCS config']);

      const response = await request(app)
        .post('/api/v1/admin/storage-config/test')
        .set('x-test-user', devAdminHeader)
        .send({ providerType: 'gcs', providerConfig: {} });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(['Invalid GCS config']);
    });

    it('tests config successfully: exercises write, read-back, delete cycle', async () => {
      const response = await request(app)
        .post('/api/v1/admin/storage-config/test')
        .set('x-test-user', devAdminHeader)
        .send({ providerType: 'local', providerConfig: { basePath: './storage/firmware' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('All storage tests passed');

      // Verify all four steps passed
      expect(response.body.steps).toHaveLength(4);
      expect(response.body.steps.every((s: any) => s.status === 'passed')).toBe(true);
      expect(response.body.steps.map((s: any) => s.step)).toEqual(['initialize', 'write', 'read', 'delete']);

      expect(buildFirmwareStorageProvider).toHaveBeenCalledWith('local', { basePath: './storage/firmware' });
    });

    it('returns 500 when provider init fails', async () => {
      (buildFirmwareStorageProvider as jest.Mock).mockReturnValue({
        initialize: jest.fn().mockRejectedValue(new Error('Connection refused')),
        upload: jest.fn(),
        download: jest.fn(),
        remove: jest.fn(),
      });

      const response = await request(app)
        .post('/api/v1/admin/storage-config/test')
        .set('x-test-user', devAdminHeader)
        .send({ providerType: 'local', providerConfig: { basePath: './storage/firmware' } });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Connection refused');
    });
  });
});
