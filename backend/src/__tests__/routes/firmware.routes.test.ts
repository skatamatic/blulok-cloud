/**
 * Firmware Routes Unit Tests
 *
 * Tests RBAC, validation, and success paths for all firmware endpoints.
 */

import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

// Mock FirmwareService — upload/list/get return raw data; routes sanitize (strip storage_path)
jest.mock('@/services/firmware/firmware.service', () => ({
  FirmwareService: {
    initFirmwareUpload: jest.fn().mockResolvedValue({ upload_mode: 'direct_multipart' }),
    completeFirmwareUpload: jest.fn(),
    uploadFirmware: jest.fn().mockResolvedValue({
      id: 'fw-1',
      version: '2.0.0',
      target_type: 'gateway',
      filename: 'firmware.bin',
      sha256_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      size_bytes: 1024,
      is_active: true,
      storage_path: '/internal/storage/fw-1.bin',
    }),
    listFirmware: jest.fn().mockResolvedValue([
      { id: 'fw-1', version: '2.0.0', target_type: 'gateway', filename: 'firmware.bin', is_active: true, storage_path: '/internal/fw-1.bin' },
    ]),
    getFirmware: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'fw-1') return { id: 'fw-1', version: '2.0.0', target_type: 'gateway', storage_path: '/internal/fw-1.bin' };
      return null;
    }),
    deleteFirmware: jest.fn().mockImplementation(async (id: string) => {
      return id === 'fw-1';
    }),
    getPushById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'push-1') return { id: 'push-1', gateway_id: 'gw-1', facility_id: 'facility-1', status: 'transferring', target_type: 'gateway' };
      return null;
    }),
    initiatePush: jest.fn().mockResolvedValue({
      id: 'push-1',
      firmware_id: 'fw-1',
      gateway_id: 'gw-1',
      status: 'pending',
      target_type: 'gateway',
    }),
    getDeliveryCapabilities: jest.fn().mockResolvedValue({
      v1_available: true,
      v2_available: true,
    }),
    getPushStatus: jest.fn().mockResolvedValue({
      id: 'push-1',
      status: 'transferring',
      target_type: 'gateway',
      chunks_total: 10,
      chunks_sent: 5,
    }),
    getPushHistory: jest.fn().mockResolvedValue([]),
    cancelPush: jest.fn().mockResolvedValue(undefined),
    handleChunkAck: jest.fn(),
    handleUpdateStatus: jest.fn(),
  },
}));

// Mock FirmwarePushEventModel — provides event log and device statuses for enhanced push-status
// Container accessed lazily so jest.mock hoisting doesn't cause ReferenceErrors
const pushEventMocks = {
  findByPushId: jest.fn().mockResolvedValue([
    { id: 'evt-1', push_id: 'push-1', event_type: 'progress', progress_percent: 50, phase: 'distributing', message: 'Distributing to devices', reported_at: new Date(), created_at: new Date() },
  ]),
  getDeviceStatuses: jest.fn().mockResolvedValue([
    { device_id: 'lock-1', status: 'complete', reported_at: new Date() },
    { device_id: 'lock-2', status: 'downloading', progress_percent: 30, reported_at: new Date() },
  ]),
  findByPushIdAndType: jest.fn().mockResolvedValue([]),
  countByPushId: jest.fn().mockResolvedValue(5),
};

jest.mock('@/models/firmware-push-event.model', () => ({
  FirmwarePushEventModel: jest.fn().mockImplementation(() => ({
    findByPushId: (...args: any[]) => pushEventMocks.findByPushId(...args),
    findByPushIdAndType: (...args: any[]) => pushEventMocks.findByPushIdAndType(...args),
    getDeviceStatuses: (...args: any[]) => pushEventMocks.getDeviceStatuses(...args),
    countByPushId: (...args: any[]) => pushEventMocks.countByPushId(...args),
    create: jest.fn(),
    createMany: jest.fn(),
  })),
}));

// Mock GatewayModel for push route
jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'facility-1' }),
    findByFacilityId: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'gw-1' }),
    update: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn(),
    updateStatusAndLastSeen: jest.fn(),
    delete: jest.fn().mockResolvedValue(true),
    getGatewayWithDevices: jest.fn().mockResolvedValue(null),
  })),
}));

describe('Firmware Routes', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  // =========================================================================
  // Authentication
  // =========================================================================

  describe('Authentication Requirements', () => {
    it('should require authentication for all routes', async () => {
      const routes = [
        { method: 'get', path: '/api/v1/firmware' },
        { method: 'get', path: '/api/v1/firmware/fw-1' },
        { method: 'delete', path: '/api/v1/firmware/fw-1' },
        { method: 'post', path: '/api/v1/firmware/fw-1/push/gw-1' },
        { method: 'get', path: '/api/v1/firmware/push-status/gw-1' },
        { method: 'post', path: '/api/v1/firmware/push/push-1/cancel' },
      ];

      for (const route of routes) {
        const fn = (request(app) as any)[route.method].bind(request(app));
        const response = await fn(route.path);
        expectUnauthorized(response);
      }
    }, 30000);
  });

  // =========================================================================
  // Upload init / complete (large files on Cloud Run via GCS signed URL)
  // =========================================================================

  describe('POST /api/v1/firmware/upload (large-file prepare/finalize)', () => {
    it('returns direct_multipart when storage has no signed upload', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          phase: 'prepare',
          version: '2.0.0',
          target_type: 'gateway',
          filename: 'firmware.bin',
          size_bytes: 1024,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.upload_mode).toBe('direct_multipart');
      expect(FirmwareService.initFirmwareUpload).toHaveBeenCalled();
    });

    it('returns signed_url session when storage supports direct upload', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initFirmwareUpload.mockResolvedValueOnce({
        upload_mode: 'signed_url',
        upload_id: 'fw-upload-1',
        storage_path: 'firmware/fw-upload-1/firmware.bin',
        upload_url: 'https://storage.googleapis.com/bucket/object',
        upload_headers: { 'Content-Type': 'application/octet-stream' },
        expires_in_seconds: 3600,
      });

      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          phase: 'prepare',
          version: '2.0.0',
          target_type: 'gateway',
          filename: 'firmware.bin',
          size_bytes: 250 * 1024 * 1024,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.upload_mode).toBe('signed_url');
      expect(response.body.data.upload_url).toContain('storage.googleapis.com');
    });

    it('finalizes signed upload and returns catalog row', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.completeFirmwareUpload.mockResolvedValueOnce({
        id: 'fw-upload-1',
        version: '2.0.0',
        target_type: 'gateway',
        filename: 'firmware.bin',
        sha256_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        size_bytes: 1024,
        is_active: true,
        storage_path: 'firmware/fw-upload-1/firmware.bin',
      });

      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          phase: 'finalize',
          upload_id: '550e8400-e29b-41d4-a716-446655440000',
          version: '2.0.0',
          target_type: 'gateway',
          filename: 'firmware.bin',
          size_bytes: 1024,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBe('fw-upload-1');
      expect(FirmwareService.completeFirmwareUpload).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Upload RBAC (multipart)
  // =========================================================================

  describe('POST /api/v1/firmware/upload', () => {
    it('should allow DEV_ADMIN to upload', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .field('version', '2.0.0')
        .field('target_type', 'gateway')
        .attach('file', Buffer.from('firmware-data'), 'firmware.bin');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toHaveProperty('storage_path');
    });

    it('should allow upload with target_type lock', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .field('version', '3.0.0')
        .field('target_type', 'lock')
        .attach('file', Buffer.from('lock-fw'), 'lock-firmware.bin');

      expect(response.status).toBe(201);
      expect(FirmwareService.uploadFirmware).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ version: '3.0.0', target_type: 'lock' }),
        expect.any(String),
      );
    });

    it('should allow upload with target_type access_control', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .field('version', '1.0.0')
        .field('target_type', 'access_control')
        .attach('file', Buffer.from('ac-fw'), 'ac-firmware.bin');

      expect(response.status).toBe(201);
      expect(FirmwareService.uploadFirmware).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ version: '1.0.0', target_type: 'access_control' }),
        expect.any(String),
      );
    });

    it('should reject ADMIN (not DEV_ADMIN)', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .field('version', '2.0.0')
        .field('target_type', 'gateway')
        .attach('file', Buffer.from('data'), 'firmware.bin');

      expectForbidden(response);
    });

    it('should reject FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .field('version', '2.0.0')
        .field('target_type', 'gateway')
        .attach('file', Buffer.from('data'), 'firmware.bin');

      expectForbidden(response);
    });

    it('should reject TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .field('version', '2.0.0')
        .field('target_type', 'gateway')
        .attach('file', Buffer.from('data'), 'firmware.bin');

      expectForbidden(response);
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .field('version', '2.0.0')
        .field('target_type', 'gateway');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('No file');
    });

    it('should reject upload without version', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/upload')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .attach('file', Buffer.from('data'), 'firmware.bin');

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // List
  // =========================================================================

  describe('GET /api/v1/firmware', () => {
    it('should allow ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/firmware')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data[0]).not.toHaveProperty('storage_path');
    });

    it('should pass target_type query to listFirmware', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      await request(app)
        .get('/api/v1/firmware?target_type=lock')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(FirmwareService.listFirmware).toHaveBeenCalledWith('lock');
    });

    it('should allow DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/firmware')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(200);
    });

    it('should allow FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/firmware')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expect(response.status).toBe(200);
    });

    it('should reject TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/firmware')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });

    it('should reject MAINTENANCE', async () => {
      const response = await request(app)
        .get('/api/v1/firmware')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

      expectForbidden(response);
    });
  });

  // =========================================================================
  // Get by ID
  // =========================================================================

  describe('GET /api/v1/firmware/:id', () => {
    it('should return firmware details without storage_path', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/fw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('fw-1');
      expect(response.body.data).not.toHaveProperty('storage_path');
    });

    it('should return 404 for non-existent firmware', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/fw-bad')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // Delete
  // =========================================================================

  describe('DELETE /api/v1/firmware/:id', () => {
    it('should allow DEV_ADMIN to soft-delete', async () => {
      const response = await request(app)
        .delete('/api/v1/firmware/fw-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(200);
    });

    it('should reject ADMIN (not DEV_ADMIN)', async () => {
      const response = await request(app)
        .delete('/api/v1/firmware/fw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectForbidden(response);
    });

    it('should return 404 for non-existent firmware', async () => {
      const response = await request(app)
        .delete('/api/v1/firmware/fw-bad')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // Push
  // =========================================================================

  describe('POST /api/v1/firmware/:id/push/:gatewayId', () => {
    it('should allow ADMIN to initiate push', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('push-1');
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      expect(FirmwareService.initiatePush).toHaveBeenCalledWith(
        'fw-1',
        'gw-1',
        expect.any(String),
        expect.any(String),
        { deliveryMode: undefined },
      );
    });

    it('should pass delivery_mode v2 to initiatePush', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValueOnce({
        id: 'push-v2',
        firmware_id: 'fw-1',
        gateway_id: 'gw-1',
        status: 'pending',
        target_type: 'gateway',
        delivery_mode: 'v2',
      });

      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ delivery_mode: 'v2' });

      expect(response.status).toBe(200);
      expect(response.body.data.delivery_mode).toBe('v2');
      expect(FirmwareService.initiatePush).toHaveBeenCalledWith(
        'fw-1',
        'gw-1',
        expect.any(String),
        expect.any(String),
        { deliveryMode: 'v2' },
      );
    });

    it('should reject invalid delivery_mode', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ delivery_mode: 'v9' });

      expect(response.status).toBe(400);
    });

    it('should allow DEV_ADMIN to initiate push', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it('should allow FACILITY_ADMIN to initiate push', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it('should reject TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({});

      expectForbidden(response);
    });
  });

  // =========================================================================
  // Push Status
  // =========================================================================

  describe('GET /api/v1/firmware/push-status/:gatewayId', () => {
    it('should return push status with key fields', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-status/gw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('push-1');
      expect(response.body.data.status).toBe('transferring');
      expect(response.body.data.chunks_total).toBe(10);
      expect(response.body.data.chunks_sent).toBe(5);
    });

    it('should pass target_type query to getPushStatus', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      await request(app)
        .get('/api/v1/firmware/push-status/gw-1?target_type=gateway')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(FirmwareService.getPushStatus).toHaveBeenCalledWith('gw-1', 'gateway');
    });

    it('should include recent_events and device_statuses with correct content', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-status/gw-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.recent_events).toHaveLength(1);
      expect(response.body.data.recent_events[0].event_type).toBe('progress');
      expect(response.body.data.recent_events[0].progress_percent).toBe(50);
      expect(response.body.data.recent_events[0].phase).toBe('distributing');
      expect(response.body.data.device_statuses).toHaveLength(2);
      expect(response.body.data.device_statuses[0].device_id).toBe('lock-1');
      expect(response.body.data.device_statuses[0].status).toBe('complete');
      expect(response.body.data.device_statuses[1].device_id).toBe('lock-2');
      expect(response.body.data.device_statuses[1].progress_percent).toBe(30);
      expect(pushEventMocks.findByPushId).toHaveBeenCalledWith('push-1', 20);
      expect(pushEventMocks.getDeviceStatuses).toHaveBeenCalledWith('push-1');
    });

    it('should omit events when include_events=false', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-status/gw-1?include_events=false')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).not.toHaveProperty('recent_events');
      expect(response.body.data).not.toHaveProperty('device_statuses');
    });
  });

  // =========================================================================
  // Push Events
  // =========================================================================

  describe('GET /api/v1/firmware/push/:pushId/events', () => {
    it('should return paginated events with response shape', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push/push-1/events')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('events');
      expect(response.body.data).toHaveProperty('device_statuses');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data.total).toBe(5);
      expect(response.body.data).toHaveProperty('limit');
      expect(response.body.data).toHaveProperty('offset');
      expect(response.body.data.limit).toBe(50);
      expect(response.body.data.offset).toBe(0);
    });

    it('should filter events by event_type', async () => {
      await request(app)
        .get('/api/v1/firmware/push/push-1/events?event_type=error')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(pushEventMocks.findByPushIdAndType).toHaveBeenCalledWith('push-1', 'error', 50, 0);
    });

    it('should support limit and offset and return them in response', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push/push-1/events?limit=10&offset=5')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(pushEventMocks.findByPushId).toHaveBeenCalledWith('push-1', 10, 5);
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.offset).toBe(5);
    });

    it('should clamp limit to 200 max', async () => {
      await request(app)
        .get('/api/v1/firmware/push/push-1/events?limit=999')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(pushEventMocks.findByPushId).toHaveBeenCalledWith('push-1', 200, 0);
    });

    it('should return 404 for non-existent push', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      (FirmwareService.getPushById as jest.Mock).mockResolvedValueOnce(null);
      const response = await request(app)
        .get('/api/v1/firmware/push/bad-push/events')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(404);
    });

    it('should enforce RBAC for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push/push-1/events')
        .set('Authorization', `Bearer ${testData.users.facility2Admin.token}`);

      expect(response.status).toBe(403);
    });

    it('should reject TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push/push-1/events')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });
  });

  // =========================================================================
  // Push History
  // =========================================================================

  describe('GET /api/v1/firmware/push-history/:gatewayId', () => {
    it('should pass target_type query to getPushHistory', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      await request(app)
        .get('/api/v1/firmware/push-history/gw-1?target_type=lock')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(FirmwareService.getPushHistory).toHaveBeenCalledWith('gw-1', 'lock', 50, 0);
    });

    it('should pass limit and offset query params to getPushHistory', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      await request(app)
        .get('/api/v1/firmware/push-history/gw-1?limit=20&offset=10')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(FirmwareService.getPushHistory).toHaveBeenCalledWith('gw-1', undefined, 20, 10);
    });
  });

  // =========================================================================
  // Cancel
  // =========================================================================

  describe('POST /api/v1/firmware/push/:pushId/cancel', () => {
    it('should allow cancellation after resolving push and facility access', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const response = await request(app)
        .post('/api/v1/firmware/push/push-1/cancel')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(FirmwareService.getPushById).toHaveBeenCalledWith('push-1');
      expect(FirmwareService.cancelPush).toHaveBeenCalledWith('push-1');
    });

    it('should return 404 when push not found', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      (FirmwareService.getPushById as jest.Mock).mockResolvedValueOnce(null);
      const response = await request(app)
        .post('/api/v1/firmware/push/bad-push/cancel')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Push not found');
    });

    it('should reject TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/push/push-1/cancel')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });
  });

  // =========================================================================
  // Cross-Facility RBAC (assertFacilityAccess)
  // =========================================================================

  describe('Cross-facility RBAC for FACILITY_ADMIN', () => {
    it('should reject FACILITY_ADMIN on push-status for another facility gateway', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-status/gw-1')
        .set('Authorization', `Bearer ${testData.users.facility2Admin.token}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('do not have access');
    });

    it('should reject FACILITY_ADMIN on push-history for another facility gateway', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-history/gw-1')
        .set('Authorization', `Bearer ${testData.users.facility2Admin.token}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('do not have access');
    });

    it('should reject FACILITY_ADMIN on push initiation for another facility gateway', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/fw-1/push/gw-1')
        .set('Authorization', `Bearer ${testData.users.facility2Admin.token}`)
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('do not have access');
    });

    it('should reject FACILITY_ADMIN on cancel for another facility push', async () => {
      const response = await request(app)
        .post('/api/v1/firmware/push/push-1/cancel')
        .set('Authorization', `Bearer ${testData.users.facility2Admin.token}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('do not have access');
    });

    it('should allow FACILITY_ADMIN on push-status for own facility gateway', async () => {
      const response = await request(app)
        .get('/api/v1/firmware/push-status/gw-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expect(response.status).toBe(200);
    });
  });
});
