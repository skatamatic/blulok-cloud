const mockRecoveryModel = {
  findById: jest.fn(),
  findActiveByFacility: jest.fn(),
  findLatestByGateway: jest.fn(),
  findLatestByFacility: jest.fn(),
  findAllActive: jest.fn().mockResolvedValue([]),
  updateStatus: jest.fn(),
  updateFields: jest.fn(),
  updateActiveGatewayId: jest.fn(),
  updateInventoryProgress: jest.fn().mockResolvedValue(undefined),
  createIfNoActive: jest.fn(),
  atomicCancel: jest.fn(),
};

const mockPushModel = { findById: jest.fn() };
const mockEventAppend = jest.fn();
const mockEventFindByRecoveryId = jest.fn().mockResolvedValue([]);
const mockFinalizeRecoverySession = jest.fn();
const mockSetRecoveryPushTarget = jest.fn();
const mockIsRecoveryPushTargetOnline = jest.fn(() => false);
const mockGetRecoveryPushGatewayId = jest.fn(() => null as string | null);
const mockGetSwapCandidatesForFacility = jest.fn(() => [] as Array<{ gatewayId: string; connected: boolean }>);
const mockGetFacilityGatewaySessions = jest.fn(() => [] as Array<{
  gatewayId: string;
  sessionRole: 'active' | 'swap_candidate';
  connected: boolean;
}>);
const mockEnrichSessionsForCompletedRecovery = jest.fn((_f: string, sessions: unknown) => sessions);
const mockIsGatewayWsConnected = jest.fn(() => false);
const mockTrxUpdate = jest.fn().mockResolvedValue(undefined);
const mockHandleFacilityDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@/models/gateway-recovery.model', () => {
  const actual = jest.requireActual('@/models/gateway-recovery.model');
  return {
    ...actual,
    GatewayRecoveryModel: jest.fn().mockImplementation(() => mockRecoveryModel),
    GatewayRecoveryEventModel: jest.fn().mockImplementation(() => ({
      append: mockEventAppend,
      findByRecoveryId: mockEventFindByRecoveryId,
    })),
  };
});

jest.mock('@/models/firmware-push.model', () => ({
  FirmwarePushModel: jest.fn().mockImplementation(() => mockPushModel),
}));

const mockGatewayModelMethods = {
  findById: jest.fn(),
  findByFacilityId: jest.fn().mockResolvedValue({ id: 'gw-old', firmware_version: '2.0.0' }),
};

const mockFirmwareModelMethods = {
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' }),
  findByVersion: jest.fn().mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' }),
};

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => mockGatewayModelMethods),
}));

jest.mock('@/models/firmware.model', () => ({
  FirmwareModel: jest.fn().mockImplementation(() => mockFirmwareModelMethods),
}));

const mockUnicastToFacility = jest.fn();
const mockGetActiveConnectionStatusForFacility = jest.fn(() => ({ connected: false }));

const mockGatewayEventsUnicast = jest.fn();
const mockGetFacilityConnectionStatus = jest.fn(() => ({ connected: true }));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getTransport: jest.fn(() => ({
        setRecoveryPushTarget: mockSetRecoveryPushTarget,
        finalizeRecoverySession: mockFinalizeRecoverySession,
        getActiveConnectionStatusForFacility: mockGetActiveConnectionStatusForFacility,
        unicastToFacility: mockUnicastToFacility,
        isRecoveryPushTargetOnline: mockIsRecoveryPushTargetOnline,
        getRecoveryPushGatewayId: mockGetRecoveryPushGatewayId,
        getSwapCandidatesForFacility: mockGetSwapCandidatesForFacility,
        getFacilityGatewaySessions: mockGetFacilityGatewaySessions,
        enrichSessionsForCompletedRecovery: mockEnrichSessionsForCompletedRecovery,
        isGatewayWsConnected: mockIsGatewayWsConnected,
      })),
      getFacilityConnectionStatus: mockGetFacilityConnectionStatus,
      unicastToFacility: mockGatewayEventsUnicast,
    })),
  },
}));

jest.mock('@/services/gateway/inventory-snapshot.service', () => ({
  InventorySnapshotService: {
    buildAndStoreForFacility: jest.fn(),
    loadSnapshotBinary: jest.fn(),
  },
}));

jest.mock('@/services/provisioning/gateway-chunk-push.engine', () => ({
  GatewayChunkPushEngine: {
    executePush: jest.fn(),
    cancelPush: jest.fn(),
    handleChunkAck: jest.fn(),
    pausePushOnDisconnect: jest.fn(),
  },
}));

const mockCancelPush = jest.fn();

jest.mock('@/services/firmware/firmware.service', () => ({
  FirmwareService: {
    initiatePush: jest.fn(),
    cancelPush: mockCancelPush,
    handleFacilityDisconnect: (...args: unknown[]) => mockHandleFacilityDisconnect(...args),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: Object.assign(jest.fn((table: string) => ({
        where: jest.fn().mockReturnThis(),
        update: mockTrxUpdate,
        first: jest.fn().mockResolvedValue({ id: 'gw-new', name: 'Swap candidate deadbeef' }),
      })), {
        transaction: jest.fn(async (cb: (trx: jest.Mock) => Promise<void>) => {
          const trx = jest.fn((table: string) => ({
            where: jest.fn().mockReturnThis(),
            update: mockTrxUpdate,
            first: jest.fn().mockResolvedValue(
              table === 'facilities'
                ? { id: 'fac-1', name: 'Test Facility' }
                : { id: 'gw-new', name: 'Swap candidate deadbeef', metadata: {} },
            ),
          }));
          await cb(trx);
        }),
      }),
    })),
  },
}));

import { GatewayChunkPushEngine } from '@/services/provisioning/gateway-chunk-push.engine';
import {
  GatewayRecoveryService,
  _testBlockingFacilities,
  _testClearPendingTimers,
  _testProductionInventorySeedArmed,
  _testVerifyTimers,
} from '@/services/gateway/gateway-recovery.service';

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('GatewayRecoveryService flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _testClearPendingTimers();
    jest.spyOn(GatewayRecoveryService, 'scheduleStatusBroadcast').mockImplementation(() => {});
    // Avoid watch timer re-entrancy loops under mocked model state.
    jest.spyOn(GatewayRecoveryService as any, 'startWatch').mockImplementation(() => {});
    mockGetActiveConnectionStatusForFacility.mockImplementation(() => ({ connected: false }));
    mockIsRecoveryPushTargetOnline.mockReturnValue(false);
    mockGetRecoveryPushGatewayId.mockReturnValue(null);
    mockGetFacilityConnectionStatus.mockReturnValue({ connected: true });
    mockGetSwapCandidatesForFacility.mockReturnValue([]);
    mockGetFacilityGatewaySessions.mockReturnValue([]);
    mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
    mockRecoveryModel.findAllActive.mockResolvedValue([]);
    mockRecoveryModel.updateInventoryProgress.mockResolvedValue(undefined);
    mockPushModel.findById.mockResolvedValue({ id: 'push-pending', status: 'in_progress' });
    mockEventFindByRecoveryId.mockResolvedValue([]);
    (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValue({ status: 'complete' });
    const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
    InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
      binary: Buffer.alloc(8),
      snapshot: { id: 'snap-default', sha256_hash: 'd', size_bytes: 8, device_count: 0 },
    });
  });

  afterEach(async () => {
    await flushAsync();
    _testClearPendingTimers();
    await flushAsync();
    _testClearPendingTimers();
    jest.restoreAllMocks();
  });

  describe('detect', () => {
    it('creates recovery and refreshes blocking cache on first swap candidate', async () => {
      const created = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'detected',
      };
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: created,
        existingRecovery: null,
      });
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(created);

      const result = await GatewayRecoveryService.detect('fac-1', 'gw-new', 'gw-old');

      expect(result).toEqual(created);
      expect(mockEventAppend).toHaveBeenCalledWith(
        'rec-1',
        'detected',
        expect.stringContaining('swap candidate'),
      );
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(true);
    });

    it('updates gateway_id when a second swap candidate connects during active recovery', async () => {
      const existing = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-first',
        previous_gateway_id: 'gw-old',
        status: 'detected',
      };
      const updated = { ...existing, gateway_id: 'gw-second' };
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: null,
        existingRecovery: existing,
      });
      mockRecoveryModel.updateActiveGatewayId.mockResolvedValue(updated);

      const result = await GatewayRecoveryService.detect('fac-1', 'gw-second', 'gw-old');

      expect(mockRecoveryModel.updateActiveGatewayId).toHaveBeenCalledWith('fac-1', 'rec-1', 'gw-second');
      expect(result?.gateway_id).toBe('gw-second');
      expect(mockEventAppend).toHaveBeenCalledWith(
        'rec-1',
        'detected',
        expect.stringContaining('Swap candidate updated'),
      );
    });

    it('ignores reconnect from demoted gateway after completed swap', async () => {
      mockRecoveryModel.findLatestByFacility.mockResolvedValue({
        id: 'rec-complete',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'complete',
      });

      const result = await GatewayRecoveryService.detect('fac-1', 'gw-old', 'gw-new');

      expect(result).toBeNull();
      expect(mockRecoveryModel.createIfNoActive).not.toHaveBeenCalled();
      expect(mockEventAppend).not.toHaveBeenCalled();
    });
  });

  describe('bypass', () => {
    it('cancels child firmware jobs before finalizing', async () => {
      const active = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_push_id: 'push-1',
      };
      mockRecoveryModel.findActiveByFacility
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(null);
      mockRecoveryModel.findById.mockResolvedValue({ ...active, status: 'bypassed', bypassed: true });

      const result = await GatewayRecoveryService.bypass('gw-new', 'fac-1', 'user-1', true);

      expect(GatewayChunkPushEngine.cancelPush).toHaveBeenCalledWith('rec-1');
      expect(mockCancelPush).toHaveBeenCalledWith('push-1');
      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith('rec-1', 'bypassed');
      expect(mockFinalizeRecoverySession).toHaveBeenCalledWith('fac-1', 'gw-new', 'gw-old');
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', null);
      expect(result.status).toBe('bypassed');
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(false);
    });
  });

  describe('cancel', () => {
    it('cancels in-flight recovery and clears push target', async () => {
      const recovery = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'firmware',
        firmware_push_id: 'push-1',
      };
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockRecoveryModel.atomicCancel.mockResolvedValue(true);

      await GatewayRecoveryService.cancel('rec-1');

      expect(GatewayChunkPushEngine.cancelPush).toHaveBeenCalledWith('rec-1');
      expect(mockCancelPush).toHaveBeenCalledWith('push-1');
      expect(mockRecoveryModel.atomicCancel).toHaveBeenCalledWith('rec-1');
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', null);
    });

    it('rejects cancel on terminal recovery', async () => {
      mockRecoveryModel.findById.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'complete',
      });

      await expect(GatewayRecoveryService.cancel('rec-1')).rejects.toThrow(/Cannot cancel/);
    });
  });

  describe('blocking state', () => {
    it('does not block inventory when latest recovery failed (terminal)', async () => {
      _testBlockingFacilities.add('fac-1');
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);

      const blocking = await GatewayRecoveryService.isBlockingActiveForFacility('fac-1');

      expect(blocking).toBe(false);
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(false);
    });

    it('blocks while recovery is in inventory_push phase', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
      });

      const blocking = await GatewayRecoveryService.isBlockingActiveForFacility('fac-1');

      expect(blocking).toBe(true);
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(true);
    });
  });

  describe('handleSnapshotStatus', () => {
    it('accepts success only during inventory_push and completes recovery', async () => {
      const recovery = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'inventory_push',
      };
      mockRecoveryModel.findById
        .mockResolvedValueOnce(recovery)
        .mockResolvedValueOnce({ ...recovery, status: 'complete' });

      const result = await GatewayRecoveryService.handleSnapshotStatus('fac-1', {
        recovery_id: 'rec-1',
        status: 'success',
      });

      expect(result.accepted).toBe(true);
      expect(result.recovery_status).toBe('complete');
      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith('rec-1', 'complete');
      expect(mockFinalizeRecoverySession).toHaveBeenCalledWith('fac-1', 'gw-new', 'gw-old');
    });

    it('marks recovery failed and unblocks inventory on gateway failure status', async () => {
      const recovery = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
      };
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);

      const result = await GatewayRecoveryService.handleSnapshotStatus('fac-1', {
        recovery_id: 'rec-1',
        status: 'failure',
        error: 'checksum mismatch',
      });

      expect(result.accepted).toBe(true);
      expect(result.recovery_status).toBe('failed');
      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith(
        'rec-1',
        'failed',
        'checksum mismatch',
      );
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(false);
    });
  });

  describe('onFirmwarePushComplete', () => {
    it('advances recovery to inventory push when linked firmware push is complete', async () => {
      const recovery = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_push_id: 'push-1',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      };
      let phase: string = 'firmware';
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'firmware') return recovery;
        return {
          ...recovery,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-1',
          inventory_nonce: 'n1',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async () => {
        phase = 'inventory_push';
      });
      mockPushModel.findById.mockResolvedValue({ id: 'push-1', status: 'complete' });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });

      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-1' });

      await GatewayRecoveryService.onFirmwarePushComplete('push-1', 'fac-1');
      await flushAsync();

      expect(InventorySnapshotService.buildAndStoreForFacility).toHaveBeenCalledWith('fac-1', 'gw-new');
      expect(mockRecoveryModel.updateFields).toHaveBeenCalledWith(
        'rec-1',
        expect.objectContaining({ status: 'inventory_push', inventory_snapshot_id: 'snap-1' }),
      );
    });

    it('requests production inventory sync before building snapshot when bound gateway is online', async () => {
      const recovery = {
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_push_id: 'push-1',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      };
      let phase: string = 'firmware';
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'firmware') return recovery;
        return {
          ...recovery,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-1',
          inventory_nonce: 'n1',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async () => {
        phase = 'inventory_push';
      });
      mockPushModel.findById.mockResolvedValue({ id: 'push-1', status: 'complete' });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });
      mockGetActiveConnectionStatusForFacility.mockImplementation(() => ({ connected: true }));
      mockUnicastToFacility.mockClear();

      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-1' });

      const advancePromise = GatewayRecoveryService.onFirmwarePushComplete('push-1', 'fac-1');

      // Wait until seed waiter is armed, then complete — avoids setImmediate race that
      // otherwise falls through to the real 30s PRODUCTION_INVENTORY_SEED_TIMEOUT_MS.
      const deadline = Date.now() + 2000;
      while (!_testProductionInventorySeedArmed.has('fac-1') && Date.now() < deadline) {
        await flushAsync();
      }
      expect(_testProductionInventorySeedArmed.has('fac-1')).toBe(true);
      GatewayRecoveryService.completeProductionInventorySeed('fac-1');

      await advancePromise;
      await flushAsync();

      expect(mockUnicastToFacility).toHaveBeenCalledWith(
        'fac-1',
        expect.objectContaining({ type: 'INVENTORY_SYNC_REQUEST' }),
      );
    });
  });

  describe('initiate after cancel', () => {
    it('creates a new detected recovery when none is active', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValue({ id: 'push-1' });

      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: {
          id: 'rec-2',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          previous_gateway_id: 'gw-old',
          status: 'detected',
        },
        existingRecovery: null,
      });
      mockRecoveryModel.findById.mockImplementation(async (id: string) => ({
        id,
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: id === 'rec-2' ? 'firmware' : 'detected',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      }));
      mockRecoveryModel.updateFields.mockResolvedValue(undefined);

      await GatewayRecoveryService.initiate('gw-new', 'fac-1', 'user-1', {
        firmwareId: 'fw-1',
      });

      expect(mockRecoveryModel.createIfNoActive).toHaveBeenCalled();
      expect(FirmwareService.initiatePush).toHaveBeenCalled();
    });

    it('skips firmware OTA when swap candidate already matches target version', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');

      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-new', firmware_version: '2.0.0' });
      mockFirmwareModelMethods.findById.mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' });
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({
        snapshotId: 'snap-1',
        deviceCount: 1,
      });

      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: {
          id: 'rec-2',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          previous_gateway_id: 'gw-old',
          status: 'detected',
        },
        existingRecovery: null,
      });
      mockRecoveryModel.findById.mockImplementation(async (id: string) => ({
        id,
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: id === 'rec-2' ? 'firmware' : 'detected',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      }));
      mockRecoveryModel.updateFields.mockResolvedValue(undefined);

      await GatewayRecoveryService.initiate('gw-new', 'fac-1', 'user-1', {
        firmwareId: 'fw-1',
      });

      expect(FirmwareService.initiatePush).not.toHaveBeenCalled();
      expect(mockRecoveryModel.updateFields).toHaveBeenCalledWith(
        'rec-2',
        expect.objectContaining({ status: 'inventory_push' }),
      );
    });

    it('skips firmware phase when includeFirmware is false', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({
        snapshotId: 'snap-1',
        deviceCount: 1,
      });

      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: {
          id: 'rec-skip',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          previous_gateway_id: 'gw-old',
          status: 'detected',
        },
        existingRecovery: null,
      });
      mockRecoveryModel.findById.mockImplementation(async (id: string) => ({
        id,
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: id === 'rec-skip' ? 'awaiting_config' : 'detected',
        firmware_id: null,
        initiated_by: 'user-1',
      }));
      mockRecoveryModel.updateFields.mockResolvedValue(undefined);

      await GatewayRecoveryService.initiate('gw-new', 'fac-1', 'user-1', {
        includeFirmware: false,
      });

      expect(FirmwareService.initiatePush).not.toHaveBeenCalled();
      expect(mockRecoveryModel.updateFields).toHaveBeenCalledWith(
        'rec-skip',
        expect.objectContaining({ status: 'inventory_push' }),
      );
    });

    it('allows swap back to demoted previous gateway after completed recovery', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValue({ id: 'push-back' });

      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-new' });
      mockGatewayModelMethods.findById.mockImplementation(async (id: string) => {
        if (id === 'gw-old') return { id: 'gw-old', firmware_version: '1.0.0' };
        if (id === 'gw-new') return { id: 'gw-new', firmware_version: '2.0.0' };
        return { id, firmware_version: '1.0.0' };
      });
      mockFirmwareModelMethods.findById.mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' });
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.createIfNoActive.mockResolvedValue({
        recovery: {
          id: 'rec-back',
          facility_id: 'fac-1',
          gateway_id: 'gw-old',
          previous_gateway_id: 'gw-new',
          status: 'detected',
        },
        existingRecovery: null,
      });
      mockRecoveryModel.findById.mockImplementation(async (id: string) => ({
        id,
        facility_id: 'fac-1',
        gateway_id: 'gw-old',
        previous_gateway_id: 'gw-new',
        status: id === 'rec-back' ? 'firmware' : 'detected',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      }));
      mockRecoveryModel.updateFields.mockResolvedValue(undefined);

      await GatewayRecoveryService.initiate('gw-old', 'fac-1', 'user-1', {
        firmwareId: 'fw-1',
      });

      expect(mockRecoveryModel.createIfNoActive).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway_id: 'gw-old',
          previous_gateway_id: 'gw-new',
        }),
      );
      expect(FirmwareService.initiatePush).toHaveBeenCalled();
    });
  });

  describe('advance', () => {
    it('starts firmware phase from awaiting_config when firmware_id is set', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValue({ id: 'push-adv' });
      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-new', firmware_version: '1.0.0' });
      mockFirmwareModelMethods.findById.mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' });

      const recovery = {
        id: 'rec-adv',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'awaiting_config',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue({ ...recovery, status: 'firmware' });

      await GatewayRecoveryService.advance('gw-new', 'fac-1');

      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith('rec-adv', 'firmware');
      expect(FirmwareService.initiatePush).toHaveBeenCalled();
      expect((GatewayRecoveryService as any).startWatch).toHaveBeenCalledWith('rec-adv');
    });

    it('starts inventory push from awaiting_config when firmware_id is null', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-adv' });

      const recovery = {
        id: 'rec-adv-inv',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'awaiting_config',
        firmware_id: null,
      };
      let phase: string = 'awaiting_config';
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'awaiting_config') return recovery;
        return {
          ...recovery,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-adv',
          inventory_nonce: 'nonce-1',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async () => {
        phase = 'inventory_push';
      });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });

      await GatewayRecoveryService.advance('gw-new', 'fac-1');
      await flushAsync();

      expect(InventorySnapshotService.buildAndStoreForFacility).toHaveBeenCalled();
      expect(mockRecoveryModel.updateFields).toHaveBeenCalledWith(
        'rec-adv-inv',
        expect.objectContaining({ status: 'inventory_push', inventory_snapshot_id: 'snap-adv' }),
      );
    });

    it('rejects advance for unsupported status', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
      });

      await expect(GatewayRecoveryService.advance('gw-new', 'fac-1')).rejects.toThrow(/Cannot advance/);
    });
  });

  describe('retry and resolveRetryPhase', () => {
    it('retries into inventory push when prior firmware push completed', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-retry' });

      const failed = {
        id: 'rec-retry',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'failed',
        firmware_id: 'fw-1',
        firmware_push_id: 'push-done',
        initiated_by: 'user-1',
      };
      let phase: string = 'awaiting_config';
      mockRecoveryModel.findLatestByGateway.mockResolvedValue(failed);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockPushModel.findById.mockResolvedValue({ id: 'push-done', status: 'complete' });
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'awaiting_config') return { ...failed, status: 'awaiting_config' };
        return {
          ...failed,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-retry',
          inventory_nonce: 'n1',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async (_id: string, fields: Record<string, unknown>) => {
        if (fields.status === 'inventory_push') phase = 'inventory_push';
      });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });

      await GatewayRecoveryService.retry('gw-new', 'fac-1');
      await flushAsync();

      expect(mockRecoveryModel.updateFields).toHaveBeenCalledWith('rec-retry', { error_message: null });
      expect(InventorySnapshotService.buildAndStoreForFacility).toHaveBeenCalled();
    });

    it('retries into firmware phase when firmware push was incomplete', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValue({ id: 'push-retry' });
      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-new', firmware_version: '1.0.0' });
      mockFirmwareModelMethods.findById.mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' });

      const failed = {
        id: 'rec-retry-fw',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'failed',
        firmware_id: 'fw-1',
        firmware_push_id: 'push-bad',
        initiated_by: 'user-1',
      };
      mockRecoveryModel.findLatestByGateway.mockResolvedValue(failed);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockPushModel.findById.mockResolvedValue({ id: 'push-bad', status: 'failed' });
      mockRecoveryModel.findById.mockResolvedValue({ ...failed, status: 'firmware' });

      await GatewayRecoveryService.retry('gw-new', 'fac-1');

      expect(FirmwareService.initiatePush).toHaveBeenCalled();
    });

    it('retries into inventory push when no firmware_id', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-nofw' });

      const failed = {
        id: 'rec-retry-nofw',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'failed',
        firmware_id: null,
        firmware_push_id: null,
      };
      let phase: string = 'awaiting_config';
      mockRecoveryModel.findLatestByGateway.mockResolvedValue(failed);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'awaiting_config') return { ...failed, status: 'awaiting_config' };
        return {
          ...failed,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-nofw',
          inventory_nonce: 'n2',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async (_id: string, fields: Record<string, unknown>) => {
        if (fields.status === 'inventory_push') phase = 'inventory_push';
      });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });

      await GatewayRecoveryService.retry('gw-new', 'fac-1');
      await flushAsync();

      expect(InventorySnapshotService.buildAndStoreForFacility).toHaveBeenCalled();
      expect(require('@/services/firmware/firmware.service').FirmwareService.initiatePush).not.toHaveBeenCalled();
    });

    it('rejects retry when another recovery is active', async () => {
      mockRecoveryModel.findLatestByGateway.mockResolvedValue({
        id: 'rec-old',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'failed',
      });
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-other',
        facility_id: 'fac-1',
        gateway_id: 'gw-other',
        status: 'detected',
      });

      await expect(GatewayRecoveryService.retry('gw-new', 'fac-1')).rejects.toThrow(/already active/);
    });
  });

  describe('startFirmwarePhase failure paths', () => {
    it('marks recovery failed when FirmwareService.initiatePush throws', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockRejectedValue(new Error('OTA unavailable'));
      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-new', firmware_version: '1.0.0' });
      mockFirmwareModelMethods.findById.mockResolvedValue({ id: 'fw-1', version: '2.0.0', target_type: 'gateway' });

      const recovery = {
        id: 'rec-fw-fail',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'awaiting_config',
        firmware_id: 'fw-1',
        initiated_by: 'user-1',
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);

      await GatewayRecoveryService.advance('gw-new', 'fac-1');

      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith('rec-fw-fail', 'failed', 'OTA unavailable');
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', null);
    });
  });

  describe('executeInventoryPush', () => {
    it('loads snapshot binary, reports chunk progress, and arms verify timeout', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(100),
        snapshot: { id: 'snap-1', sha256_hash: 'hash', size_bytes: 100, device_count: 2 },
      });

      const recovery = {
        id: 'rec-push',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-1',
        inventory_nonce: 'nonce-push',
        inventory_chunks_sent: 0,
        inventory_chunks_total: null,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      (GatewayChunkPushEngine.executePush as jest.Mock).mockImplementation(async (opts: any) => {
        await opts.onManifestSent();
        await opts.onChunkProgress(1, 1, 100);
        await opts.onAllChunksSent();
        return { status: 'complete' };
      });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await flushAsync();

      expect(InventorySnapshotService.loadSnapshotBinary).toHaveBeenCalledWith('snap-1');
      expect(mockRecoveryModel.updateInventoryProgress).toHaveBeenCalled();
      expect(_testVerifyTimers.has('rec-push')).toBe(true);
      const pushOpts = (GatewayChunkPushEngine.executePush as jest.Mock).mock.calls[0][0];
      expect(pushOpts.isCancelled()).toBe(false);
      expect(pushOpts.isOnline()).toBe(true);
    });

    it('marks recovery failed when chunk push reports failure', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(50),
        snapshot: { id: 'snap-fail', sha256_hash: 'h', size_bytes: 50, device_count: 1 },
      });

      const recovery = {
        id: 'rec-push-fail',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-fail',
        inventory_nonce: 'n',
        inventory_chunks_sent: 0,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      (GatewayChunkPushEngine.executePush as jest.Mock).mockImplementation(async (opts: any) => {
        await opts.onFailed('chunk timeout');
        return { status: 'failed' };
      });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await flushAsync();

      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith('rec-push-fail', 'failed', 'chunk timeout');
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', null);
    });

    it('logs pause when push outcome is disconnect', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(20),
        snapshot: { id: 'snap-d', sha256_hash: 'd', size_bytes: 20, device_count: 0 },
      });
      const recovery = {
        id: 'rec-disc',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-d',
        inventory_nonce: 'nd',
        inventory_chunks_sent: 2,
        inventory_chunks_total: 5,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);
      (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValue({ status: 'disconnect' });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await flushAsync();

      expect(GatewayChunkPushEngine.executePush).toHaveBeenCalledWith(
        expect.objectContaining({ startChunkIndex: 2 }),
      );
    });
  });

  describe('handleVerifyTimeout', () => {
    const VERIFY_TIMEOUT_MS = 5 * 60 * 1000;

    it('fails inventory_push recovery after verify timeout elapses', async () => {
      const verifyCallbacks: Array<() => void> = [];
      const realSetTimeout = global.setTimeout;
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms === VERIFY_TIMEOUT_MS && typeof fn === 'function') {
          verifyCallbacks.push(() => (fn as (...a: unknown[]) => void)(...args));
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn as any, ms as any, ...args);
      }) as typeof setTimeout);

      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(10),
        snapshot: { id: 'snap-v', sha256_hash: 'v', size_bytes: 10, device_count: 1 },
      });

      const recovery = {
        id: 'rec-verify',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-v',
        inventory_nonce: 'nv',
        inventory_chunks_sent: 0,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      (GatewayChunkPushEngine.executePush as jest.Mock).mockImplementation(async (opts: any) => {
        await opts.onAllChunksSent();
        return { status: 'complete' };
      });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await flushAsync();
      expect(verifyCallbacks).toHaveLength(1);

      await verifyCallbacks[0]();
      await flushAsync();

      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith(
        'rec-verify',
        'failed',
        'Gateway inventory snapshot verification timed out',
      );
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', null);
      setTimeoutSpy.mockRestore();
    });

    it('no-ops verify timeout when recovery left inventory_push', async () => {
      const verifyCallbacks: Array<() => void> = [];
      const realSetTimeout = global.setTimeout;
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms === VERIFY_TIMEOUT_MS && typeof fn === 'function') {
          verifyCallbacks.push(() => (fn as (...a: unknown[]) => void)(...args));
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn as any, ms as any, ...args);
      }) as typeof setTimeout);

      const recovery = {
        id: 'rec-verify-done',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-v2',
        inventory_nonce: 'nv2',
        inventory_chunks_sent: 0,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => ({
        ...recovery,
        status: 'complete',
      }));
      // executeInventoryPush needs the inventory_push row first
      let reads = 0;
      mockRecoveryModel.findById.mockImplementation(async () => {
        reads += 1;
        if (reads === 1) return recovery;
        return { ...recovery, status: 'complete' };
      });
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      (GatewayChunkPushEngine.executePush as jest.Mock).mockImplementation(async (opts: any) => {
        await opts.onAllChunksSent();
        return { status: 'complete' };
      });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await flushAsync();
      expect(verifyCallbacks).toHaveLength(1);

      mockRecoveryModel.updateStatus.mockClear();
      await verifyCallbacks[0]();
      await flushAsync();

      expect(mockRecoveryModel.updateStatus).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('checkChildProgress', () => {
    it('fails recovery when linked firmware push failed', async () => {
      const recovery = {
        id: 'rec-child',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'firmware',
        firmware_push_id: 'push-fail',
        firmware_id: 'fw-1',
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockPushModel.findById.mockResolvedValue({
        id: 'push-fail',
        status: 'failed',
        error_message: 'device rejected image',
      });

      await GatewayRecoveryService.onFirmwarePushComplete('push-other', 'fac-1');
      // Force watch path: call resume which starts watch + checkChildProgress for firmware
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);
      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith(
        'rec-child',
        'failed',
        'device rejected image',
      );
    });

    it('clears watch for terminal recoveries', async () => {
      (GatewayRecoveryService as any).startWatch.mockRestore();
      const clearWatchSpy = jest.spyOn(GatewayRecoveryService as any, 'clearWatch');
      jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as unknown as typeof setInterval);

      mockRecoveryModel.findAllActive.mockResolvedValue([
        {
          id: 'rec-term',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          status: 'awaiting_config',
        },
      ]);
      mockRecoveryModel.findById.mockResolvedValue({
        id: 'rec-term',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'complete',
      });

      await GatewayRecoveryService.recoverInFlightStateOnStartup();
      await flushAsync();

      expect(clearWatchSpy).toHaveBeenCalledWith('rec-term');
      clearWatchSpy.mockRestore();
      (global.setInterval as unknown as jest.Mock).mockRestore?.();
      jest.spyOn(GatewayRecoveryService as any, 'startWatch').mockImplementation(() => {});
    });
  });

  describe('dismissSpuriousDetection', () => {
    it('cancels detected recovery when demoted gateway is still marked active', async () => {
      const detected = {
        id: 'rec-spurious',
        facility_id: 'fac-1',
        gateway_id: 'gw-old',
        previous_gateway_id: 'gw-new',
        status: 'detected',
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(detected);
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-new' });
      mockRecoveryModel.findLatestByFacility.mockResolvedValue({
        id: 'rec-complete',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'complete',
      });
      mockRecoveryModel.atomicCancel.mockImplementation(async () => {
        // Prevent refreshBlockingState -> resolveActiveRecovery from re-dismissing forever.
        mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
        return true;
      });

      const status = await GatewayRecoveryService.getStatusForFacility('fac-1');

      expect(mockRecoveryModel.atomicCancel).toHaveBeenCalledWith('rec-spurious');
      expect(mockEventAppend).toHaveBeenCalledWith(
        'rec-spurious',
        'cancelled',
        expect.stringContaining('demoted gateway'),
      );
      expect(status).toEqual(expect.objectContaining({ status: 'complete' }));
    });
  });

  describe('seedProductionInventoryBeforeSnapshot branches', () => {
    it('skips seed when bound gateway does not match previous gateway', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-skip' });

      const recovery = {
        id: 'rec-seed-skip',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_id: 'fw-1',
        firmware_push_id: 'push-1',
        initiated_by: 'user-1',
      };
      let phase: string = 'firmware';
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => {
        if (phase === 'firmware') return recovery;
        return {
          ...recovery,
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-skip',
          inventory_nonce: 'ns',
          inventory_chunks_sent: 0,
        };
      });
      mockRecoveryModel.updateFields.mockImplementation(async () => {
        phase = 'inventory_push';
      });
      mockPushModel.findById.mockResolvedValue({ id: 'push-1', status: 'complete' });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-other' });

      await GatewayRecoveryService.onFirmwarePushComplete('push-1', 'fac-1');
      await flushAsync();

      expect(mockUnicastToFacility).not.toHaveBeenCalled();
      expect(InventorySnapshotService.buildAndStoreForFacility).toHaveBeenCalled();
    });

    it('skips seed when previous_gateway_id is null', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockResolvedValue({ snapshotId: 'snap-null' });

      const recovery = {
        id: 'rec-seed-null',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: null,
        status: 'awaiting_config',
        firmware_id: null,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockImplementation(async () => ({
        ...recovery,
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-null',
        inventory_nonce: 'nn',
        inventory_chunks_sent: 0,
      }));

      await GatewayRecoveryService.advance('gw-new', 'fac-1');
      await flushAsync();

      expect(mockUnicastToFacility).not.toHaveBeenCalled();
    });
  });

  describe('production inventory seed helpers', () => {
    it('gates seed responses by armed state and active bound session', () => {
      expect(GatewayRecoveryService.isProductionInventorySeedArmed('fac-1')).toBe(false);
      expect(
        GatewayRecoveryService.isProductionInventorySeedAllowed('fac-1', 'active', 'gw-old', 'gw-old'),
      ).toBe(false);

      _testProductionInventorySeedArmed.add('fac-1');
      expect(GatewayRecoveryService.isProductionInventorySeedArmed('fac-1')).toBe(true);
      expect(
        GatewayRecoveryService.isProductionInventorySeedAllowed('fac-1', 'active', 'gw-old', 'gw-old'),
      ).toBe(true);
      expect(
        GatewayRecoveryService.isProductionInventorySeedAllowed('fac-1', 'swap_candidate', 'gw-old', 'gw-old'),
      ).toBe(false);
    });

    it('completeProductionInventorySeed is a no-op without a waiter', () => {
      expect(() => GatewayRecoveryService.completeProductionInventorySeed('fac-missing')).not.toThrow();
    });
  });

  describe('getRecoveryLinkedPushIds and disconnect handlers', () => {
    it('returns firmware and inventory push ids for active push phases', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        firmware_push_id: 'push-1',
      });

      await expect(GatewayRecoveryService.getRecoveryLinkedPushIds('fac-1')).resolves.toEqual({
        firmwarePushId: 'push-1',
        inventoryRecoveryId: 'rec-1',
      });
    });

    it('returns null outside recovery push statuses', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        status: 'detected',
      });
      await expect(GatewayRecoveryService.getRecoveryLinkedPushIds('fac-1')).resolves.toBeNull();
    });

    it('pauses pushes when swap candidate disconnects during inventory_push', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        firmware_push_id: 'push-1',
      });

      await GatewayRecoveryService.handleRecoveryPushTargetDisconnect('fac-1', 'gw-new');

      expect(GatewayChunkPushEngine.pausePushOnDisconnect).toHaveBeenCalledWith(
        'fac-1',
        { onlyPushIds: expect.any(Set) },
      );
      expect(mockHandleFacilityDisconnect).toHaveBeenCalledWith(
        'fac-1',
        { disconnectedSessionRole: 'swap_candidate' },
      );
    });

    it('schedules status broadcast when disconnect is for a different gateway', async () => {
      const scheduleSpy = jest.spyOn(GatewayRecoveryService, 'scheduleStatusBroadcast');
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'firmware',
      });

      await GatewayRecoveryService.handleRecoveryPushTargetDisconnect('fac-1', 'gw-other');

      expect(scheduleSpy).toHaveBeenCalledWith('fac-1');
      expect(GatewayChunkPushEngine.pausePushOnDisconnect).not.toHaveBeenCalled();
      scheduleSpy.mockRestore();
    });

    it('handleFacilityDisconnect pauses when recovery push target is offline', async () => {
      mockIsRecoveryPushTargetOnline.mockReturnValue(false);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        status: 'inventory_push',
      });

      await GatewayRecoveryService.handleFacilityDisconnect('fac-1');

      expect(GatewayChunkPushEngine.pausePushOnDisconnect).toHaveBeenCalledWith('fac-1');
    });

    it('handleFacilityDisconnect no-ops when recovery push target still online', async () => {
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      await GatewayRecoveryService.handleFacilityDisconnect('fac-1');

      expect(GatewayChunkPushEngine.pausePushOnDisconnect).not.toHaveBeenCalled();
    });
  });

  describe('resumePendingForFacility and recoverInFlightStateOnStartup', () => {
    it('resumes firmware watch when active recovery is in firmware phase', async () => {
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-fw',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'firmware',
        firmware_push_id: 'push-pending',
      });
      mockRecoveryModel.findById.mockResolvedValue({
        id: 'rec-fw',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'firmware',
        firmware_push_id: 'push-pending',
      });
      mockPushModel.findById.mockResolvedValue({ id: 'push-pending', status: 'in_progress' });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await Promise.resolve();

      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', 'gw-new');
      expect((GatewayRecoveryService as any).startWatch).toHaveBeenCalledWith('rec-fw');
    });

    it('notifies inventory resume and re-executes push', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(12),
        snapshot: { id: 'snap-r', sha256_hash: 'r', size_bytes: 12, device_count: 1 },
      });
      (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValue({ status: 'complete' });
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-inv',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-r',
        inventory_chunks_sent: 1,
        inventory_chunks_total: 3,
      });
      mockRecoveryModel.findById.mockResolvedValue({
        id: 'rec-inv',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-r',
        inventory_nonce: 'nr',
        inventory_chunks_sent: 1,
        inventory_chunks_total: 3,
      });

      await GatewayRecoveryService.resumePendingForFacility('fac-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(mockGatewayEventsUnicast).toHaveBeenCalledWith(
        'fac-1',
        expect.objectContaining({ type: 'INVENTORY_SNAPSHOT_RESUME' }),
      );
      expect(GatewayChunkPushEngine.executePush).toHaveBeenCalled();
    });

    it('re-arms in-flight recoveries on startup', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(6),
        snapshot: { id: 'snap-s', sha256_hash: 's', size_bytes: 6, device_count: 0 },
      });
      (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValue({ status: 'complete' });

      mockRecoveryModel.findAllActive.mockResolvedValue([
        {
          id: 'rec-start-inv',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          status: 'inventory_push',
          inventory_snapshot_id: 'snap-s',
          inventory_nonce: 'ns',
          inventory_chunks_sent: 0,
        },
        {
          id: 'rec-start-fw',
          facility_id: 'fac-2',
          gateway_id: 'gw-2',
          status: 'firmware',
          firmware_push_id: 'push-2',
        },
      ]);
      mockRecoveryModel.findById.mockImplementation(async (id: string) => {
        if (id === 'rec-start-inv') {
          return {
            id,
            facility_id: 'fac-1',
            gateway_id: 'gw-new',
            status: 'inventory_push',
            inventory_snapshot_id: 'snap-s',
            inventory_nonce: 'ns',
            inventory_chunks_sent: 0,
          };
        }
        return {
          id,
          facility_id: 'fac-2',
          gateway_id: 'gw-2',
          status: 'firmware',
          firmware_push_id: 'push-2',
        };
      });
      mockPushModel.findById.mockResolvedValue({ id: 'push-2', status: 'in_progress' });
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);

      await GatewayRecoveryService.recoverInFlightStateOnStartup();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-1', 'gw-new');
      expect(mockSetRecoveryPushTarget).toHaveBeenCalledWith('fac-2', 'gw-2');
      expect((GatewayRecoveryService as any).startWatch).toHaveBeenCalledWith('rec-start-fw');
      expect(GatewayChunkPushEngine.executePush).toHaveBeenCalled();
    });
  });

  describe('status and options helpers', () => {
    it('getStatusForGateway prefers active recovery involving the gateway', async () => {
      mockRecoveryModel.findLatestByGateway.mockResolvedValue({
        id: 'rec-latest',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'complete',
      });
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-active',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
      });

      await expect(GatewayRecoveryService.getStatusForGateway('gw-new')).resolves.toEqual(
        expect.objectContaining({ id: 'rec-active' }),
      );
    });

    it('getRecoveryById and getRecoveryEvents map model rows', async () => {
      mockRecoveryModel.findById.mockResolvedValue({ id: 'rec-1', status: 'detected' });
      mockEventFindByRecoveryId.mockResolvedValue([
        {
          id: 'evt-1',
          phase: 'detected',
          message: 'hello',
          progress_percent: 0,
          created_at: new Date('2024-01-01'),
        },
      ]);

      await expect(GatewayRecoveryService.getRecoveryById('rec-1')).resolves.toEqual(
        expect.objectContaining({ id: 'rec-1' }),
      );
      await expect(GatewayRecoveryService.getRecoveryEvents('rec-1', 10)).resolves.toEqual([
        expect.objectContaining({ id: 'evt-1', phase: 'detected', message: 'hello' }),
      ]);
    });

    it('resolveDefaultFirmwareId picks highest semver gateway image', async () => {
      mockFirmwareModelMethods.findAll.mockResolvedValue([
        { id: 'fw-low', version: '1.0.0' },
        { id: 'fw-high', version: '2.1.0' },
      ]);
      await expect(GatewayRecoveryService.resolveDefaultFirmwareId()).resolves.toBe('fw-high');
    });

    it('getRecoveryOptions reports candidate vs production firmware match', async () => {
      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-new', firmware_version: '2.0.0' });
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old', firmware_version: '2.0.0' });
      mockFirmwareModelMethods.findByVersion.mockResolvedValue({ id: 'fw-1', version: '2.0.0' });

      const options = await GatewayRecoveryService.getRecoveryOptions('gw-new', 'fac-1');

      expect(options).toEqual({
        productionFirmwareVersion: '2.0.0',
        candidateFirmwareVersion: '2.0.0',
        candidateMatchesProduction: true,
        productionFirmwareImageAvailable: true,
      });
    });

    it('isRecoveryPushTargetOnline reads transport', () => {
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);
      expect(GatewayRecoveryService.isRecoveryPushTargetOnline('fac-1')).toBe(true);
    });

    it('handleChunkAck delegates to chunk engine', async () => {
      await GatewayRecoveryService.handleChunkAck('fac-1', { chunk_index: 1 });
      expect(GatewayChunkPushEngine.handleChunkAck).toHaveBeenCalledWith('fac-1', { chunk_index: 1 });
    });
  });

  describe('getRecoveryCandidatesPayload and facility access', () => {
    it('returns demoted previous gateway metadata after completed swap', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
      mockRecoveryModel.findLatestByFacility.mockResolvedValue({
        id: 'rec-done',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'complete',
      });
      mockGetSwapCandidatesForFacility.mockReturnValue([
        { gatewayId: 'gw-old', connected: true },
        { gatewayId: 'gw-park', connected: true },
      ]);
      mockGetFacilityGatewaySessions.mockReturnValue([
        { gatewayId: 'gw-new', sessionRole: 'active', connected: true },
      ]);
      mockEnrichSessionsForCompletedRecovery.mockImplementation((_f, sessions) => sessions);
      mockIsGatewayWsConnected.mockReturnValue(true);

      const payload = await GatewayRecoveryService.getRecoveryCandidatesPayload('fac-1');

      expect(payload.demotedPreviousGateway).toEqual({ gatewayId: 'gw-old', connected: true });
      expect(payload.candidates.map((c) => c.gatewayId)).toEqual(['gw-park']);
      expect(mockEnrichSessionsForCompletedRecovery).toHaveBeenCalled();
    });

    it('resolveFacilityAccessForUnboundGateway matches swap candidates then recovery history', async () => {
      mockGetSwapCandidatesForFacility.mockReturnValue([{ gatewayId: 'gw-park', connected: true }]);
      await expect(
        GatewayRecoveryService.resolveFacilityAccessForUnboundGateway('gw-park', ['fac-1', 'fac-2']),
      ).resolves.toBe('fac-1');

      mockGetSwapCandidatesForFacility.mockReturnValue([]);
      mockGatewayModelMethods.findById.mockResolvedValue({ id: 'gw-x', metadata: {} });
      mockRecoveryModel.findLatestByGateway.mockResolvedValue({
        id: 'rec-hist',
        facility_id: 'fac-2',
        gateway_id: 'gw-x',
      });
      await expect(
        GatewayRecoveryService.resolveFacilityAccessForUnboundGateway('gw-x', ['fac-2']),
      ).resolves.toBe('fac-2');
    });
  });

  describe('blocking error path and initiate validation', () => {
    it('treats blocking check failures as blocking', async () => {
      mockRecoveryModel.findActiveByFacility.mockRejectedValue(new Error('db down'));

      await expect(GatewayRecoveryService.isBlockingActiveForFacility('fac-err')).resolves.toBe(true);
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-err')).toBe(true);
    });

    it('rejects initiate with non-gateway firmware target', async () => {
      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'detected',
      });
      mockFirmwareModelMethods.findById.mockResolvedValue({
        id: 'fw-bad',
        version: '1.0.0',
        target_type: 'device',
      });

      await expect(
        GatewayRecoveryService.initiate('gw-new', 'fac-1', 'user-1', { firmwareId: 'fw-bad' }),
      ).rejects.toThrow(/Invalid firmware/);
    });

    it('resolves production firmware when initiate omits firmwareId', async () => {
      const { FirmwareService } = require('@/services/firmware/firmware.service');
      FirmwareService.initiatePush.mockResolvedValue({ id: 'push-prod' });
      mockGatewayModelMethods.findById.mockImplementation(async (id: string) => {
        if (id === 'gw-old') return { id: 'gw-old', firmware_version: '2.0.0' };
        return { id: 'gw-new', firmware_version: '1.0.0' };
      });
      mockFirmwareModelMethods.findByVersion.mockResolvedValue({
        id: 'fw-prod',
        version: '2.0.0',
        target_type: 'gateway',
      });
      mockFirmwareModelMethods.findById.mockResolvedValue({
        id: 'fw-prod',
        version: '2.0.0',
        target_type: 'gateway',
      });

      mockRecoveryModel.findActiveByFacility.mockResolvedValue({
        id: 'rec-prod',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'detected',
      });
      mockRecoveryModel.findById.mockImplementation(async () => ({
        id: 'rec-prod',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_id: 'fw-prod',
        firmware_push_id: 'push-prod',
        initiated_by: 'user-1',
      }));
      // Keep checkChildProgress from re-entering inventory forever.
      mockPushModel.findById.mockResolvedValue({ id: 'push-prod', status: 'in_progress' });

      await GatewayRecoveryService.initiate('gw-new', 'fac-1', 'user-1');
      await flushAsync();

      expect(mockFirmwareModelMethods.findByVersion).toHaveBeenCalledWith('2.0.0', 'gateway');
      expect(FirmwareService.initiatePush).toHaveBeenCalledWith(
        'fw-prod',
        'gw-new',
        'fac-1',
        'user-1',
      );
    });
  });

  describe('startInventoryPushPhase resume path', () => {
    it('re-executes push when already in inventory_push with snapshot', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.loadSnapshotBinary.mockResolvedValue({
        binary: Buffer.alloc(8),
        snapshot: { id: 'snap-re', sha256_hash: 're', size_bytes: 8, device_count: 1 },
      });
      (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValue({ status: 'complete' });

      const active = {
        id: 'rec-reenter',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'firmware',
        firmware_id: 'fw-1',
        firmware_push_id: 'push-x',
      };
      const inventoryState = {
        ...active,
        status: 'inventory_push',
        inventory_snapshot_id: 'snap-re',
        inventory_nonce: 'nre',
        inventory_chunks_sent: 0,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(active);
      mockRecoveryModel.findById.mockResolvedValue(inventoryState);
      mockGetRecoveryPushGatewayId.mockReturnValue('gw-new');
      mockIsRecoveryPushTargetOnline.mockReturnValue(true);

      await GatewayRecoveryService.advance('gw-new', 'fac-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(GatewayChunkPushEngine.executePush).toHaveBeenCalled();
      expect((GatewayRecoveryService as any).startWatch).toHaveBeenCalledWith('rec-reenter');
    });

    it('fails when inventory snapshot build throws', async () => {
      const { InventorySnapshotService } = require('@/services/gateway/inventory-snapshot.service');
      InventorySnapshotService.buildAndStoreForFacility.mockRejectedValue(new Error('snapshot boom'));

      const recovery = {
        id: 'rec-snap-fail',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'awaiting_config',
        firmware_id: null,
      };
      mockRecoveryModel.findActiveByFacility.mockResolvedValue(recovery);
      mockRecoveryModel.findById.mockResolvedValue(recovery);
      mockGatewayModelMethods.findByFacilityId.mockResolvedValue({ id: 'gw-old' });

      await expect(GatewayRecoveryService.advance('gw-new', 'fac-1')).rejects.toThrow(/snapshot boom/);
      expect(mockRecoveryModel.updateStatus).toHaveBeenCalledWith(
        'rec-snap-fail',
        'failed',
        'snapshot boom',
      );
    });
  });
});