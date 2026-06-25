const mockRecoveryModel = {
  findById: jest.fn(),
  findActiveByFacility: jest.fn(),
  findLatestByGateway: jest.fn(),
  findLatestByFacility: jest.fn(),
  updateStatus: jest.fn(),
  updateFields: jest.fn(),
  updateActiveGatewayId: jest.fn(),
  createIfNoActive: jest.fn(),
  atomicCancel: jest.fn(),
};

const mockPushModel = { findById: jest.fn() };
const mockEventAppend = jest.fn();
const mockFinalizeRecoverySession = jest.fn();
const mockSetRecoveryPushTarget = jest.fn();
const mockTrxUpdate = jest.fn().mockResolvedValue(undefined);

jest.mock('@/models/gateway-recovery.model', () => {
  const actual = jest.requireActual('@/models/gateway-recovery.model');
  return {
    ...actual,
    GatewayRecoveryModel: jest.fn().mockImplementation(() => mockRecoveryModel),
    GatewayRecoveryEventModel: jest.fn().mockImplementation(() => ({
      append: mockEventAppend,
    })),
  };
});

jest.mock('@/models/firmware-push.model', () => ({
  FirmwarePushModel: jest.fn().mockImplementation(() => mockPushModel),
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
    findByFacilityId: jest.fn().mockResolvedValue({ id: 'gw-old' }),
  })),
}));

jest.mock('@/models/firmware.model', () => ({
  FirmwareModel: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: 'fw-1', target_type: 'gateway' }),
  })),
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getTransport: jest.fn(() => ({
        setRecoveryPushTarget: mockSetRecoveryPushTarget,
        finalizeRecoverySession: mockFinalizeRecoverySession,
      })),
      getFacilityConnectionStatus: jest.fn(() => ({ connected: true })),
      unicastToFacility: jest.fn(),
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
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: Object.assign(jest.fn((table: string) => ({
        where: jest.fn().mockReturnThis(),
        update: mockTrxUpdate,
      })), {
        transaction: jest.fn(async (cb: (trx: jest.Mock) => Promise<void>) => {
          const trx = jest.fn((table: string) => ({
            where: jest.fn().mockReturnThis(),
            update: mockTrxUpdate,
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
} from '@/services/gateway/gateway-recovery.service';

describe('GatewayRecoveryService flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _testBlockingFacilities.clear();
    mockRecoveryModel.findActiveByFacility.mockResolvedValue(null);
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
  });
});
