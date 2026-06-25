const mockRecoveryModel = {
  findById: jest.fn(),
  findActiveByFacility: jest.fn(),
  findLatestByGateway: jest.fn(),
  findLatestByFacility: jest.fn(),
  updateStatus: jest.fn(),
  updateFields: jest.fn(),
  updateActiveGatewayId: jest.fn(),
};

const mockPushModel = {
  findById: jest.fn(),
};

jest.mock('@/models/gateway-recovery.model', () => {
  const actual = jest.requireActual('@/models/gateway-recovery.model');
  return {
    ...actual,
    GatewayRecoveryModel: jest.fn().mockImplementation(() => mockRecoveryModel),
    GatewayRecoveryEventModel: jest.fn().mockImplementation(() => ({
      append: jest.fn(),
    })),
  };
});

jest.mock('@/models/firmware-push.model', () => ({
  FirmwarePushModel: jest.fn().mockImplementation(() => mockPushModel),
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
    findByFacilityId: jest.fn(),
  })),
}));

jest.mock('@/models/firmware.model', () => ({
  FirmwareModel: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getTransport: jest.fn(),
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

jest.mock('@/services/firmware/firmware.service', () => ({
  FirmwareService: {
    initiatePush: jest.fn(),
    cancelPush: jest.fn(),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: jest.fn(),
    })),
  },
}));

import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';

describe('GatewayRecoveryService.handleSnapshotStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects inventory snapshot success outside inventory_push phase', async () => {
    mockRecoveryModel.findById.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      status: 'firmware',
    });

    const result = await GatewayRecoveryService.handleSnapshotStatus('fac-1', {
      recovery_id: 'rec-1',
      status: 'success',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('inventory_push');
    expect(mockRecoveryModel.updateStatus).not.toHaveBeenCalled();
  });
});

describe('GatewayRecoveryService.retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects retry when latest recovery is not failed', async () => {
    mockRecoveryModel.findLatestByGateway.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      status: 'detected',
    });

    await expect(GatewayRecoveryService.retry('gw-new', 'fac-1')).rejects.toThrow(/failed/i);
  });
});

describe('GatewayRecoveryService.resolveRetryPhase (via retry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries firmware when firmware push did not complete', async () => {
    const { FirmwareService } = require('@/services/firmware/firmware.service');
    FirmwareService.initiatePush.mockResolvedValue({ id: 'push-2' });

    mockRecoveryModel.findLatestByGateway.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      status: 'failed',
      firmware_id: 'fw-1',
      firmware_push_id: 'push-1',
      initiated_by: 'user-1',
    });
    mockRecoveryModel.findById.mockImplementation(async (id: string) => ({
      id,
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      status: 'firmware',
      firmware_id: 'fw-1',
      firmware_push_id: 'push-2',
      initiated_by: 'user-1',
    }));
    mockPushModel.findById.mockResolvedValue({ id: 'push-1', status: 'failed' });
    mockRecoveryModel.updateFields.mockResolvedValue(undefined);

    await GatewayRecoveryService.retry('gw-new', 'fac-1');

    expect(FirmwareService.initiatePush).toHaveBeenCalled();
  });
});
