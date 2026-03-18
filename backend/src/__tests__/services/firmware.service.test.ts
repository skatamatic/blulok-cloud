/**
 * FirmwareService Unit Tests
 *
 * Tests upload validation, push lifecycle, chunking, signing, cancellation,
 * and progress broadcasting. All dependencies are fully mocked for fast execution.
 */

jest.mock('@/models/firmware.model');
jest.mock('@/models/firmware-push.model');
jest.mock('@/models/firmware-push-event.model');
jest.mock('@/models/gateway.model');
jest.mock('@/services/crypto/ed25519.service');
jest.mock('@/services/gateway/gateway-events.service');
jest.mock('@/services/firmware/firmware-storage.factory');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import * as crypto from 'crypto';
import { FirmwareService, _testActivePushes, _testResumeInFlightPushes } from '@/services/firmware/firmware.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { getFirmwareStorageProvider, validateFirmwareFile } from '@/services/firmware/firmware-storage.factory';

// Shared mock objects wired directly into FirmwareService's static fields
const mockFirmwareModel = {
  findById: jest.fn(),
  findByVersion: jest.fn(),
  findActive: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  softDelete: jest.fn(),
};

const mockPushModel = {
  findById: jest.fn(),
  findActiveByGateway: jest.fn(),
  findLatestByGateway: jest.fn(),
  findByGatewayId: jest.fn(),
  findByFacilityAndTargetType: jest.fn(),
  createIfNoActiveByGatewayTarget: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  updateProgress: jest.fn().mockResolvedValue(undefined),
  updateChunksTotal: jest.fn().mockResolvedValue(undefined),
  atomicCancel: jest.fn().mockResolvedValue(true),
  atomicFailIfActive: jest.fn().mockResolvedValue(true),
  updateProgressPercent: jest.fn().mockResolvedValue(undefined),
  updateDeviceCounts: jest.fn().mockResolvedValue(undefined),
  findActiveByFacilities: jest.fn().mockResolvedValue([]),
  findAllActive: jest.fn().mockResolvedValue([]),
};

const mockPushEventModel = {
  create: jest.fn().mockResolvedValue({}),
  createMany: jest.fn().mockResolvedValue(undefined),
  findByPushId: jest.fn().mockResolvedValue([]),
  getDeviceStatuses: jest.fn().mockResolvedValue([]),
  countByPushId: jest.fn().mockResolvedValue(0),
};

const mockGatewayModel = { findById: jest.fn() };

const mockStorageProvider = {
  initialize: jest.fn().mockResolvedValue(undefined),
  upload: jest.fn().mockResolvedValue('/storage/firmware/test/test.bin'),
  download: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockUnicast = jest.fn();

/** Re-establish every mock. Called in the top-level beforeEach. */
function wireAllMocks() {
  (FirmwareService as any).firmwareModel = mockFirmwareModel;
  (FirmwareService as any).pushModel = mockPushModel;
  (FirmwareService as any).pushEventModel = mockPushEventModel;
  (FirmwareService as any).gatewayModel = mockGatewayModel;
  (getFirmwareStorageProvider as jest.Mock).mockResolvedValue(mockStorageProvider);
  (Ed25519Service.signCommandJwt as jest.Mock).mockResolvedValue('signed-jwt');
  (GatewayEventsService.getInstance as jest.Mock).mockReturnValue({
    unicastToFacility: mockUnicast,
    getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: true }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  wireAllMocks();
  _testActivePushes.clear();
  _testResumeInFlightPushes.clear();
});

describe('FirmwareService', () => {
  // =========================================================================
  // Upload
  // =========================================================================
  describe('uploadFirmware', () => {
    const validFile = { originalname: 'fw.bin', buffer: Buffer.alloc(128, 0x41), size: 128 };
    const meta = { version: '2.0.0' };

    beforeEach(() => {
      (validateFirmwareFile as jest.Mock).mockReturnValue([]);
      mockFirmwareModel.findByVersion.mockResolvedValue(null);
      mockFirmwareModel.create.mockResolvedValue({ id: 'mock-uuid', version: '2.0.0', target_type: 'gateway', filename: 'fw.bin', sha256_hash: 'a'.repeat(64), size_bytes: 128 });
    });

    it('stores binary and creates DB record', async () => {
      await FirmwareService.uploadFirmware(validFile, meta, 'u1');
      expect(mockStorageProvider.upload).toHaveBeenCalled();
      expect(mockFirmwareModel.findByVersion).toHaveBeenCalledWith('2.0.0', 'gateway');
      expect(mockFirmwareModel.create).toHaveBeenCalledWith(expect.objectContaining({ version: '2.0.0', target_type: 'gateway', uploaded_by: 'u1' }));
    });

    it('computes SHA-256', async () => {
      await FirmwareService.uploadFirmware(validFile, meta, 'u1');
      expect(mockFirmwareModel.create.mock.calls[0][0].sha256_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects when validation fails', async () => {
      (validateFirmwareFile as jest.Mock).mockReturnValue(['file too large']);
      await expect(FirmwareService.uploadFirmware(validFile, meta, 'u1')).rejects.toThrow('validation failed');
    });

    it('rejects duplicate version', async () => {
      mockFirmwareModel.findByVersion.mockResolvedValue({ id: 'existing' });
      await expect(FirmwareService.uploadFirmware(validFile, meta, 'u1')).rejects.toThrow('already exists');
    });

    it('passes compatible_models', async () => {
      await FirmwareService.uploadFirmware(validFile, { ...meta, compatible_models: ['BLK-100'] }, 'u1');
      expect(mockFirmwareModel.create.mock.calls[0][0].compatible_models).toEqual(['BLK-100']);
    });

    it('uploads firmware with target_type lock', async () => {
      await FirmwareService.uploadFirmware(validFile, { ...meta, target_type: 'lock' }, 'u1');
      expect(mockFirmwareModel.findByVersion).toHaveBeenCalledWith('2.0.0', 'lock');
      expect(mockFirmwareModel.create).toHaveBeenCalledWith(expect.objectContaining({ target_type: 'lock' }));
    });

    it('version uniqueness is scoped by target_type (lock 2.0.0 does not conflict with gateway 2.0.0)', async () => {
      mockFirmwareModel.findByVersion.mockImplementation(async (version: string, targetType: string) => {
        return targetType === 'gateway' ? { id: 'existing-gw' } : null;
      });
      await FirmwareService.uploadFirmware(validFile, { ...meta, target_type: 'lock' }, 'u1');
      expect(mockFirmwareModel.findByVersion).toHaveBeenCalledWith('2.0.0', 'lock');
      expect(mockFirmwareModel.create).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Catalog helpers
  // =========================================================================
  describe('listFirmware', () => {
    it('delegates to findActive', async () => {
      mockFirmwareModel.findActive.mockResolvedValue([]);
      await FirmwareService.listFirmware();
      expect(mockFirmwareModel.findActive).toHaveBeenCalledWith(undefined);
    });

    it('passes targetType to findActive when provided', async () => {
      mockFirmwareModel.findActive.mockResolvedValue([]);
      await FirmwareService.listFirmware('lock');
      expect(mockFirmwareModel.findActive).toHaveBeenCalledWith('lock');
    });
  });

  describe('deleteFirmware', () => {
    it('looks up firmware, soft-deletes, then removes binary from storage', async () => {
      mockFirmwareModel.findById.mockResolvedValue({ id: 'fw-1', storage_path: '/storage/fw-1.bin' });
      mockFirmwareModel.softDelete.mockResolvedValue(true);
      expect(await FirmwareService.deleteFirmware('fw-1')).toBe(true);
      expect(mockFirmwareModel.findById).toHaveBeenCalledWith('fw-1');
      expect(mockFirmwareModel.softDelete).toHaveBeenCalledWith('fw-1');
      expect(mockStorageProvider.remove).toHaveBeenCalledWith('/storage/fw-1.bin');
    });

    it('returns false when firmware not found', async () => {
      mockFirmwareModel.findById.mockResolvedValue(null);
      expect(await FirmwareService.deleteFirmware('fw-bad')).toBe(false);
      expect(mockStorageProvider.remove).not.toHaveBeenCalled();
    });
  });

  describe('getPushById', () => {
    it('delegates to pushModel.findById', async () => {
      mockPushModel.findById.mockResolvedValue({ id: 'push-1', status: 'pending', target_type: 'gateway' });
      const push = await FirmwareService.getPushById('push-1');
      expect(push!.id).toBe('push-1');
      expect(mockPushModel.findById).toHaveBeenCalledWith('push-1');
    });

    it('returns null when push not found', async () => {
      mockPushModel.findById.mockResolvedValue(null);
      expect(await FirmwareService.getPushById('x')).toBeNull();
    });
  });

  // =========================================================================
  // initiatePush
  // =========================================================================
  describe('initiatePush', () => {
    let executeSpy: jest.SpyInstance;

    beforeEach(() => {
      mockFirmwareModel.findById.mockResolvedValue({ id: 'fw-1', is_active: true, target_type: 'gateway' });
      mockGatewayModel.findById.mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' });
      mockPushModel.createIfNoActiveByGatewayTarget.mockResolvedValue({
        push: { id: 'push-1', status: 'pending', target_type: 'gateway' },
        existingPush: null,
      });
      // Prevent real background task
      executeSpy = jest.spyOn(FirmwareService, 'executePush').mockResolvedValue(undefined);
    });

    afterEach(() => {
      executeSpy.mockRestore();
    });

    it('creates push record and spawns task', async () => {
      const push = await FirmwareService.initiatePush('fw-1', 'gw-1', 'fac-1', 'u1');
      expect(push.id).toBe('push-1');
      expect(mockPushModel.createIfNoActiveByGatewayTarget).toHaveBeenCalledWith(expect.objectContaining({
        firmware_id: 'fw-1',
        gateway_id: 'gw-1',
        target_type: 'gateway',
      }));
    });

    it('rejects missing firmware', async () => {
      mockFirmwareModel.findById.mockResolvedValue(null);
      await expect(FirmwareService.initiatePush('x', 'gw-1', 'fac-1', 'u1')).rejects.toThrow('not found or inactive');
    });

    it('rejects inactive firmware', async () => {
      mockFirmwareModel.findById.mockResolvedValue({ id: 'fw-1', is_active: false });
      await expect(FirmwareService.initiatePush('fw-1', 'gw-1', 'fac-1', 'u1')).rejects.toThrow('not found or inactive');
    });

    it('rejects missing gateway', async () => {
      mockGatewayModel.findById.mockResolvedValue(null);
      await expect(FirmwareService.initiatePush('fw-1', 'x', 'fac-1', 'u1')).rejects.toThrow('Gateway not found');
    });

    it('rejects when gateway is offline', async () => {
      (GatewayEventsService.getInstance as jest.Mock).mockReturnValue({
        unicastToFacility: mockUnicast,
        getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: false }),
      });
      await expect(FirmwareService.initiatePush('fw-1', 'gw-1', 'fac-1', 'u1')).rejects.toThrow('Gateway is offline');
    });

    it('rejects gateway with active push', async () => {
      mockPushModel.createIfNoActiveByGatewayTarget.mockResolvedValue({
        push: null,
        existingPush: { id: 'old', status: 'transferring', target_type: 'gateway' },
      });
      await expect(FirmwareService.initiatePush('fw-1', 'gw-1', 'fac-1', 'u1')).rejects.toThrow('already has an active');
    });

    it('active push check is scoped by target_type (lock push does not block gateway push)', async () => {
      mockFirmwareModel.findById.mockResolvedValue({ id: 'fw-1', is_active: true, target_type: 'gateway' });
      mockPushModel.createIfNoActiveByGatewayTarget.mockResolvedValue({
        push: { id: 'push-1', status: 'pending', target_type: 'gateway' },
        existingPush: null,
      }); // no active gateway push
      const push = await FirmwareService.initiatePush('fw-1', 'gw-1', 'fac-1', 'u1');
      expect(mockPushModel.createIfNoActiveByGatewayTarget).toHaveBeenCalledWith(expect.objectContaining({
        gateway_id: 'gw-1',
        target_type: 'gateway',
      }));
      expect(push.id).toBe('push-1');
    });
  });

  // =========================================================================
  // getPushStatus / cancelPush
  // =========================================================================
  describe('getPushHistory', () => {
    it('delegates to pushModel.findByGatewayId with gatewayId and optional targetType, limit, offset', async () => {
      mockPushModel.findByGatewayId.mockResolvedValue([]);
      await FirmwareService.getPushHistory('gw-1');
      expect(mockPushModel.findByGatewayId).toHaveBeenCalledWith('gw-1', undefined, 50, 0);
    });

    it('passes targetType, limit, and offset when provided', async () => {
      mockPushModel.findByGatewayId.mockResolvedValue([]);
      await FirmwareService.getPushHistory('gw-1', 'lock', 20, 10);
      expect(mockPushModel.findByGatewayId).toHaveBeenCalledWith('gw-1', 'lock', 20, 10);
    });
  });

  describe('getPushStatus', () => {
    it('returns active push first', async () => {
      mockPushModel.findActiveByGateway.mockResolvedValue({ id: 'p1', status: 'transferring', target_type: 'gateway' });
      expect((await FirmwareService.getPushStatus('gw-1'))!.id).toBe('p1');
      expect(mockPushModel.findActiveByGateway).toHaveBeenCalledWith('gw-1', undefined);
    });

    it('falls back to latest', async () => {
      mockPushModel.findActiveByGateway.mockResolvedValue(null);
      mockPushModel.findLatestByGateway.mockResolvedValue({ id: 'p2', status: 'complete', target_type: 'gateway' });
      expect((await FirmwareService.getPushStatus('gw-1'))!.status).toBe('complete');
    });

    it('returns null when none exist', async () => {
      mockPushModel.findActiveByGateway.mockResolvedValue(null);
      mockPushModel.findLatestByGateway.mockResolvedValue(null);
      expect(await FirmwareService.getPushStatus('gw-1')).toBeNull();
    });

    it('passes targetType to findActiveByGateway and findLatestByGateway', async () => {
      mockPushModel.findActiveByGateway.mockResolvedValue(null);
      mockPushModel.findLatestByGateway.mockResolvedValue({ id: 'p2', status: 'complete', target_type: 'lock' });
      await FirmwareService.getPushStatus('gw-1', 'lock');
      expect(mockPushModel.findActiveByGateway).toHaveBeenCalledWith('gw-1', 'lock');
      expect(mockPushModel.findLatestByGateway).toHaveBeenCalledWith('gw-1', 'lock');
    });
  });

  describe('cancelPush', () => {
    let broadcastSpy: jest.SpyInstance;

    beforeEach(() => {
      broadcastSpy = jest.spyOn(FirmwareService as any, 'broadcastProgress').mockImplementation(() => {});
    });

    afterEach(() => {
      broadcastSpy.mockRestore();
    });

    it('atomically cancels via atomicCancel and sets in-memory cancel flag', async () => {
      mockPushModel.findById.mockResolvedValue({ id: 'p1', status: 'transferring', facility_id: 'f1', firmware_id: 'fw1', gateway_id: 'gw1', target_type: 'gateway' });
      mockPushModel.atomicCancel.mockResolvedValue(true);
      await FirmwareService.cancelPush('p1');
      expect(mockPushModel.atomicCancel).toHaveBeenCalledWith('p1');
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects missing push', async () => {
      mockPushModel.findById.mockResolvedValue(null);
      await expect(FirmwareService.cancelPush('x')).rejects.toThrow('Push not found');
    });

    it('rejects terminal push before calling atomicCancel', async () => {
      mockPushModel.findById.mockResolvedValue({ id: 'p1', status: 'complete', target_type: 'gateway' });
      await expect(FirmwareService.cancelPush('p1')).rejects.toThrow("Cannot cancel push with status 'complete'");
      expect(mockPushModel.atomicCancel).not.toHaveBeenCalled();
    });

    it('throws when atomicCancel returns false (race: push already completed)', async () => {
      mockPushModel.findById.mockResolvedValue({ id: 'p1', status: 'transferring', facility_id: 'f1', gateway_id: 'gw1', target_type: 'gateway' });
      mockPushModel.atomicCancel.mockResolvedValue(false);
      await expect(FirmwareService.cancelPush('p1')).rejects.toThrow('Push already completed or cancelled');
    });
  });

  // =========================================================================
  // executePush — chunking, signing, progress
  // =========================================================================
  describe('executePush', () => {
    const CHUNK = 128 * 1024;
    // Small binary: 2 full chunks + partial = 3 chunks; hash must match firmware.sha256_hash
    const binSize = CHUNK * 2 + 100;
    const mockBinary = Buffer.alloc(binSize, 0xAB);
    const mockBinarySha256 = crypto.createHash('sha256').update(mockBinary).digest('hex');
    const mockPush = { id: 'push-1', firmware_id: 'fw-1', gateway_id: 'gw-1', facility_id: 'fac-1', target_type: 'gateway' as const };
    const mockFirmware = { id: 'fw-1', version: '2.0.0', target_type: 'gateway' as const, filename: 'fw-2.0.0.bin', sha256_hash: mockBinarySha256, size_bytes: binSize, storage_path: '/p', compatible_models: [] };

    let ackSpy: jest.SpyInstance;
    let broadcastSpy: jest.SpyInstance;

    beforeEach(() => {
      // Models
      mockPushModel.findById.mockResolvedValue(mockPush);
      mockFirmwareModel.findById.mockResolvedValue(mockFirmware);
      mockStorageProvider.download.mockResolvedValue(mockBinary);

      // Instantly resolve chunk ACKs (no real timers)
      ackSpy = jest.spyOn(FirmwareService as any, 'waitForChunkAck').mockResolvedValue(undefined);
      // Suppress subscription broadcasting
      broadcastSpy = jest.spyOn(FirmwareService as any, 'broadcastProgress').mockImplementation(() => {});
    });

    afterEach(() => {
      ackSpy.mockRestore();
      broadcastSpy.mockRestore();
    });

    it('computes correct chunk count', async () => {
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateChunksTotal).toHaveBeenCalledWith('push-1', 3);
    });

    it('signs manifest JWT with correct payload including target_type and filename', async () => {
      await FirmwareService.executePush('push-1');
      const payload = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[0][0];
      expect(payload.cmd_type).toBe('FIRMWARE_MANIFEST');
      expect(payload.version).toBe('2.0.0');
      expect(payload.target_type).toBe('gateway');
      expect(payload.filename).toBe('fw-2.0.0.bin');
      expect(payload.sha256).toBe(mockBinarySha256);
      expect(payload.chunk_count).toBe(3);
      expect(payload.push_id).toBe('push-1');
      expect(payload.nonce).toBeDefined();
    });

    it('sends manifest then N chunks over WS', async () => {
      await FirmwareService.executePush('push-1');
      // manifest + 3 chunks = 4 unicast calls
      expect(mockUnicast).toHaveBeenCalledTimes(4);
      expect(mockUnicast.mock.calls[0][1].type).toBe('FIRMWARE_MANIFEST');
      expect(mockUnicast.mock.calls[1][1].type).toBe('FIRMWARE_CHUNK');
      expect(mockUnicast.mock.calls[2][1].type).toBe('FIRMWARE_CHUNK');
      expect(mockUnicast.mock.calls[3][1].type).toBe('FIRMWARE_CHUNK');
    });

    it('signs each chunk JWT correctly', async () => {
      await FirmwareService.executePush('push-1');
      const c0 = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[1][0];
      expect(c0.cmd_type).toBe('FIRMWARE_CHUNK');
      expect(c0.chunk_index).toBe(0);
      expect(c0.chunk_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(c0.data).toBeDefined();
    });

    it('updates progress after each chunk', async () => {
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateProgress).toHaveBeenCalledTimes(3);
      expect(mockPushModel.updateProgress).toHaveBeenCalledWith('push-1', 1);
      expect(mockPushModel.updateProgress).toHaveBeenCalledWith('push-1', 2);
      expect(mockPushModel.updateProgress).toHaveBeenCalledWith('push-1', 3);
    });

    it('marks push verifying when all chunks ACKed (awaiting gateway confirmation)', async () => {
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'verifying');
    });

    it('marks push failed after max ACK retries', async () => {
      ackSpy.mockRejectedValue(new Error('timeout'));
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', expect.stringContaining('ACK failed'));
    });

    it('handles push-not-found gracefully', async () => {
      mockPushModel.findById.mockResolvedValue(null);
      await FirmwareService.executePush('bad');
      expect(mockStorageProvider.download).not.toHaveBeenCalled();
    });

    it('handles firmware-not-found', async () => {
      mockFirmwareModel.findById.mockResolvedValue(null);
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', 'Firmware record not found');
    });

    it('broadcasts progress at each step', async () => {
      await FirmwareService.executePush('push-1');
      // manifest_sent + 3 transferring + complete = at least 5 calls
      expect(broadcastSpy).toHaveBeenCalledTimes(5);
    });

    it('fails push when stored binary SHA-256 does not match firmware record', async () => {
      mockFirmwareModel.findById.mockResolvedValue({ ...mockFirmware, sha256_hash: 'mismatched-hash' });
      await FirmwareService.executePush('push-1');
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', expect.stringContaining('SHA-256 mismatch'));
    });
  });

  // =========================================================================
  // Inbound message handlers (lightweight)
  // =========================================================================
  describe('handleChunkAck', () => {
    it('does not throw when no active push matches', async () => {
      await expect(FirmwareService.handleChunkAck('f1', { nonce: 'n', chunkIndex: 0, status: 'ok' })).resolves.not.toThrow();
    });

    it('resolves matching push chunk resolver when nonce and facilityId match', async () => {
      const pushId = 'push-ack-test';
      const nonce = 'test-nonce';
      const facilityId = 'fac-1';
      let resolved = false;
      _testActivePushes.set(pushId, {
        cancel: false,
        nonce,
        facilityId,
        chunkAckResolvers: new Map([
          [0, { resolve: () => { resolved = true; }, reject: () => {} }],
        ]),
      });
      await FirmwareService.handleChunkAck(facilityId, { nonce, chunkIndex: 0, status: 'ok' });
      expect(resolved).toBe(true);
      _testActivePushes.delete(pushId);
    });

    it('does not resolve when facilityId does not match', async () => {
      const pushId = 'push-ack-fac-mismatch';
      const nonce = 'n2';
      let resolved = false;
      _testActivePushes.set(pushId, {
        cancel: false,
        nonce,
        facilityId: 'fac-other',
        chunkAckResolvers: new Map([
          [0, { resolve: () => { resolved = true; }, reject: () => {} }],
        ]),
      });
      await FirmwareService.handleChunkAck('fac-1', { nonce, chunkIndex: 0, status: 'ok' });
      expect(resolved).toBe(false);
      _testActivePushes.delete(pushId);
    });
  });

  describe('handleUpdateStatus', () => {
    const mkVerifyingPush = (overrides: any = {}) => ({
      id: 'push-1', status: 'verifying', facility_id: 'fac-1',
      gateway_id: 'gw-1', firmware_id: 'fw-1', target_type: 'gateway',
      ...overrides,
    });

    let broadcastSpy: jest.SpyInstance;
    beforeEach(() => {
      broadcastSpy = jest.spyOn(FirmwareService as any, 'broadcastProgress').mockImplementation(() => {});
    });
    afterEach(() => {
      broadcastSpy.mockRestore();
    });

    it('updates push to complete when gateway reports success', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush());
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'success', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'complete');
    });

    it('rejects update when push_id is missing', async () => {
      await FirmwareService.handleUpdateStatus('fac-1', { status: 'success', target_type: 'gateway' });
      expect(mockPushModel.findById).not.toHaveBeenCalled();
    });

    it('does not re-update an already complete push', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush({ status: 'complete' }));
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'success', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('updates push to failed when gateway reports failed', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush());
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'failed', error: 'CRC mismatch', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', 'CRC mismatch');
    });

    it('updates push to verifying when gateway reports verifying', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush({ status: 'transferring' }));
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'verifying', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'verifying');
    });

    it('maps applying gateway status to verifying', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush({ status: 'transferring' }));
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'applying', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'verifying');
    });

    it('logs warning for unknown status and does not update', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush());
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'rebooting', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects update when facility does not own push', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush({ facility_id: 'fac-other' }));
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'verifying' });
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects update when target_type does not match push target', async () => {
      mockPushModel.findById.mockResolvedValue(mkVerifyingPush({ target_type: 'lock' }));
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 'success', target_type: 'gateway' });
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects update when push_id does not exist', async () => {
      mockPushModel.findById.mockResolvedValue(null);
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'missing', status: 'success' });
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects messages with invalid status type', async () => {
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', status: 123, target_type: 'gateway' });
      expect(mockPushModel.findById).not.toHaveBeenCalled();
    });

    it('rejects messages with missing status', async () => {
      await FirmwareService.handleUpdateStatus('fac-1', { push_id: 'push-1', target_type: 'gateway' });
      expect(mockPushModel.findById).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleProgress
  // =========================================================================

  describe('handleProgress', () => {
    const mockPush = {
      id: 'push-1', firmware_id: 'fw-1', gateway_id: 'gw-1', facility_id: 'fac-1',
      status: 'transferring', target_type: 'gateway', chunks_total: 10, chunks_sent: 5,
      progress_percent: 50, phase: null, devices_total: null, devices_complete: 0, devices_failed: 0,
    };

    beforeEach(() => {
      mockPushModel.findById.mockResolvedValue(mockPush);
    });

    it('rejects messages with invalid push_id', async () => {
      await FirmwareService.handleProgress('fac-1', { push_id: '', progress_percent: 50 });
      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
    });

    it('creates progress event and updates push aggregate', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 75,
        phase: 'distributing',
        message: 'Distributing to locks',
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 75, 'distributing');
      expect(mockPushEventModel.createMany).toHaveBeenCalled();
      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('progress');
      expect(events[0].progress_percent).toBe(75);
      expect(events[0].phase).toBe('distributing');
    });

    it('creates device_status events and updates device counts', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        devices: [
          { device_id: 'lock-1', status: 'complete' },
          { device_id: 'lock-2', status: 'downloading', progress_percent: 40 },
          { device_id: 'lock-3', status: 'failed', error: 'CRC mismatch' },
        ],
      });

      expect(mockPushModel.updateDeviceCounts).toHaveBeenCalledWith('push-1', 3, 1, 1);
      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(3);
      expect(events.every((e: any) => e.event_type === 'device_status')).toBe(true);
    });

    it('deduplicates duplicate device reports in a single payload', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        devices: [
          { device_id: 'lock-1', status: 'pending', progress_percent: 20 },
          { device_id: 'lock-1', status: 'downloading', progress_percent: 55 },
          { device_id: 'lock-1', status: 'complete', progress_percent: 100 },
        ],
      });

      expect(mockPushModel.updateDeviceCounts).toHaveBeenCalledWith('push-1', 1, 1, 0);
      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].device_id).toBe('lock-1');
      expect(events[0].device_status).toBe('complete');
      expect(events[0].progress_percent).toBe(100);
    });

    it('creates error event for warning severity', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        error: { code: 'TIMEOUT', message: 'Lock-2 timed out', severity: 'warning' },
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('error');
      expect(events[0].error_severity).toBe('warning');
      expect(mockPushModel.updateStatus).not.toHaveBeenCalled();
    });

    it('auto-fails push on critical error', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        error: { code: 'FATAL', message: 'Flash memory corrupt', severity: 'critical' },
      });

      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', 'Flash memory corrupt');
    });

    it('creates info event for message-only progress', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        message: 'Rebooting gateway...',
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('info');
      expect(events[0].message).toBe('Rebooting gateway...');
    });

    it('does not throw when no matching push found', async () => {
      mockPushModel.findById.mockResolvedValue(null);

      await expect(
        FirmwareService.handleProgress('fac-1', { push_id: 'unknown', target_type: 'gateway', progress_percent: 50 }),
      ).resolves.not.toThrow();
    });

    it('ignores progress when facility does not own push', async () => {
      mockPushModel.findById.mockResolvedValue({ ...mockPush, facility_id: 'fac-other' });
      await FirmwareService.handleProgress('fac-1', { push_id: 'push-1', progress_percent: 50 });
      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
      expect(mockPushModel.updateProgressPercent).not.toHaveBeenCalled();
    });

    it('ignores progress when target_type does not match push', async () => {
      mockPushModel.findById.mockResolvedValue({ ...mockPush, target_type: 'lock' });
      await FirmwareService.handleProgress('fac-1', { push_id: 'push-1', target_type: 'gateway', progress_percent: 50 });
      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
      expect(mockPushModel.updateProgressPercent).not.toHaveBeenCalled();
    });

    it('skips progress for terminal push (complete)', async () => {
      mockPushModel.findById.mockResolvedValue({ ...mockPush, status: 'complete' });

      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 50,
      });

      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
      expect(mockPushModel.updateProgressPercent).not.toHaveBeenCalled();
    });

    it('skips progress for terminal push (failed)', async () => {
      mockPushModel.findById.mockResolvedValue({ ...mockPush, status: 'failed' });

      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 80,
      });

      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
    });

    it('rejects non-string push_id types', async () => {
      await FirmwareService.handleProgress('fac-1', { push_id: 123, progress_percent: 50 });
      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();

      await FirmwareService.handleProgress('fac-1', { push_id: null, progress_percent: 50 });
      expect(mockPushEventModel.createMany).not.toHaveBeenCalled();
    });

    it('clamps out-of-range progress_percent', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 150,
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 100, undefined);
      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events[0].progress_percent).toBe(100);
    });

    it('clamps negative progress_percent to 0', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: -10,
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 0, undefined);
    });

    it('treats NaN progress_percent as 0', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 'not-a-number',
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 0, undefined);
    });

    it('sanitizes non-string phase to undefined', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 50,
        phase: 123,
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 50, undefined);
    });

    it('creates device_status events with correct per-device fields', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        devices: [
          { device_id: 'lock-1', status: 'complete' },
          { device_id: 'lock-2', status: 'downloading', progress_percent: 40 },
          { device_id: 'lock-3', status: 'failed', error: 'CRC mismatch' },
        ],
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events[0].device_id).toBe('lock-1');
      expect(events[0].device_status).toBe('complete');
      expect(events[1].device_id).toBe('lock-2');
      expect(events[1].progress_percent).toBe(40);
      expect(events[2].device_id).toBe('lock-3');
      expect(events[2].error_message).toBe('CRC mismatch');
    });

    it('normalizes Tulsi camelCase device payload fields', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 100,
        phase: 'flashing_ble_mcu',
        message: 'Sending blocks to downstream lock',
        devices: [
          {
            deviceId: '468c1af93ae9a967f9aeb5d3a107d60dc643048d29b5f5fc4b81ad8eac0f638d',
            progressPercent: 100,
            status: 'complete',
            error: null,
          },
        ],
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      const deviceEvent = events.find((e: any) => e.event_type === 'device_status');
      expect(deviceEvent.device_id).toBe('468c1af93ae9a967f9aeb5d3a107d60dc643048d29b5f5fc4b81ad8eac0f638d');
      expect(deviceEvent.progress_percent).toBe(100);
      expect(deviceEvent.device_status).toBe('complete');
      expect(mockPushModel.updateDeviceCounts).toHaveBeenCalledWith('push-1', 1, 1, 0);
    });

    it('skips invalid device entries (missing device_id)', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        devices: [
          { device_id: 'lock-1', status: 'complete' },
          { status: 'downloading' },
          { device_id: '', status: 'pending' },
          { device_id: 123, status: 'pending' },
        ],
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].device_id).toBe('lock-1');
    });

    it('does not call updateDeviceCounts for empty devices array', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        devices: [],
      });

      expect(mockPushModel.updateDeviceCounts).not.toHaveBeenCalled();
    });

    it('creates error event with full field assertions', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        error: { code: 'TIMEOUT', message: 'Lock-2 timed out', severity: 'warning' },
        message: 'Retrying...',
      });

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].push_id).toBe('push-1');
      expect(events[0].event_type).toBe('error');
      expect(events[0].error_code).toBe('TIMEOUT');
      expect(events[0].error_message).toBe('Lock-2 timed out');
      expect(events[0].error_severity).toBe('warning');
      expect(events[0].message).toBe('Retrying...');
    });

    it('handles combined payload with progress, devices, and message', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        progress_percent: 60,
        phase: 'distributing',
        message: 'Distributing...',
        devices: [
          { device_id: 'lock-1', status: 'downloading', progress_percent: 50 },
          { device_id: 'lock-2', status: 'complete' },
        ],
      });

      expect(mockPushModel.updateProgressPercent).toHaveBeenCalledWith('push-1', 60, 'distributing');
      expect(mockPushModel.updateDeviceCounts).toHaveBeenCalledWith('push-1', 2, 1, 0);

      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(3);
      expect(events[0].event_type).toBe('progress');
      expect(events[1].event_type).toBe('device_status');
      expect(events[2].event_type).toBe('device_status');
    });

    it('auto-fails push on critical error and creates error event', async () => {
      await FirmwareService.handleProgress('fac-1', {
        push_id: 'push-1',
        error: { code: 'FATAL', message: 'Flash memory corrupt', severity: 'critical' },
      });

      expect(mockPushModel.updateStatus).toHaveBeenCalledWith('push-1', 'failed', 'Flash memory corrupt');
      const events = mockPushEventModel.createMany.mock.calls[0][0];
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('error');
      expect(events[0].error_severity).toBe('critical');
    });
  });

  describe('handleFacilityDisconnect', () => {
    let broadcastSpy: jest.SpyInstance;

    beforeEach(() => {
      broadcastSpy = jest.spyOn(FirmwareService as any, 'broadcastProgress').mockImplementation(() => {});
    });

    afterEach(() => {
      broadcastSpy.mockRestore();
    });

    it('marks active facility pushes failed and clears pending ACK resolvers', async () => {
      const rejectSpy = jest.fn();
      _testActivePushes.set('push-1', {
        cancel: false,
        nonce: 'n-1',
        facilityId: 'fac-1',
        chunkAckResolvers: new Map([
          [0, { resolve: jest.fn(), reject: rejectSpy }],
        ]),
      });
      mockPushModel.findById.mockResolvedValue({
        id: 'push-1',
        firmware_id: 'fw-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        target_type: 'gateway',
        progress_percent: 25,
        chunks_total: 10,
        chunks_sent: 2,
      });

      await FirmwareService.handleFacilityDisconnect('fac-1');

      expect(mockPushModel.atomicFailIfActive).toHaveBeenCalledWith('push-1', expect.stringContaining('disconnected'));
      expect(rejectSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'push-1' }),
        'failed',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining('disconnected'),
      );
    });
  });

  describe('resumePendingForFacility', () => {
    let executeSpy: jest.SpyInstance;

    beforeEach(() => {
      executeSpy = jest.spyOn(FirmwareService, 'executePush').mockResolvedValue(undefined);
    });

    afterEach(() => {
      executeSpy.mockRestore();
    });

    it('resumes pending and transferring pushes, skips verifying', async () => {
      mockPushModel.findActiveByFacilities.mockResolvedValue([
        { id: 'p1', status: 'pending', facility_id: 'fac-1' },
        { id: 'p2', status: 'transferring', facility_id: 'fac-1' },
        { id: 'p3', status: 'verifying', facility_id: 'fac-1' },
      ]);

      await FirmwareService.resumePendingForFacility('fac-1');

      expect(executeSpy).toHaveBeenCalledTimes(2);
      expect(executeSpy).toHaveBeenCalledWith('p1');
      expect(executeSpy).toHaveBeenCalledWith('p2');
      expect(executeSpy).not.toHaveBeenCalledWith('p3');
    });

    it('does not start duplicate resume tasks for same push', async () => {
      mockPushModel.findActiveByFacilities.mockResolvedValue([
        { id: 'p1', status: 'pending', facility_id: 'fac-1' },
      ]);
      executeSpy.mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
      );

      await Promise.all([
        FirmwareService.resumePendingForFacility('fac-1'),
        FirmwareService.resumePendingForFacility('fac-1'),
      ]);

      expect(executeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('recoverInFlightStateOnStartup', () => {
    let scheduleSpy: jest.SpyInstance;
    let broadcastSpy: jest.SpyInstance;

    beforeEach(() => {
      scheduleSpy = jest.spyOn(FirmwareService as any, 'scheduleVerifyingTimeout').mockImplementation(() => {});
      broadcastSpy = jest.spyOn(FirmwareService as any, 'broadcastProgress').mockImplementation(() => {});
    });

    afterEach(() => {
      scheduleSpy.mockRestore();
      broadcastSpy.mockRestore();
    });

    it('fails stale verifying pushes and re-arms timers for recent verifying pushes', async () => {
      const now = Date.now();
      const staleUpdatedAt = new Date(now - (16 * 60 * 1000)); // > default 15m timeout
      const recentUpdatedAt = new Date(now - (2 * 60 * 1000));

      mockPushModel.findAllActive.mockResolvedValue([
        { id: 'stale-v', status: 'verifying', updated_at: staleUpdatedAt, chunks_total: 4, chunks_sent: 4, progress_percent: 100, target_type: 'gateway' },
        { id: 'recent-v', status: 'verifying', updated_at: recentUpdatedAt, chunks_total: 4, chunks_sent: 4, progress_percent: 100, target_type: 'gateway' },
        { id: 'pending-1', status: 'pending', updated_at: recentUpdatedAt, target_type: 'gateway' },
      ]);
      mockPushModel.atomicFailIfActive.mockResolvedValue(true);
      mockPushModel.findById.mockImplementation(async (id: string) => ({
        id,
        firmware_id: 'fw',
        gateway_id: 'gw',
        facility_id: 'fac',
        target_type: 'gateway',
        progress_percent: 100,
        chunks_total: 4,
        chunks_sent: 4,
        error_message: 'Firmware verification timeout',
      }));

      await FirmwareService.recoverInFlightStateOnStartup();

      expect(mockPushModel.atomicFailIfActive).toHaveBeenCalledWith(
        'stale-v',
        expect.stringContaining('Gateway did not report final firmware status before timeout'),
      );
      expect(scheduleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'recent-v' }),
        expect.any(Number),
      );
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'stale-v' }),
        'failed',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(String),
      );
    });
  });
});
