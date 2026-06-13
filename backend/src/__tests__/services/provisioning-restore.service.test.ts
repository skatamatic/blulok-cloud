import { ProvisioningRestoreService } from '@/services/provisioning/provisioning-restore.service';
import { GatewayChunkPushEngine } from '@/services/provisioning/gateway-chunk-push.engine';

jest.mock('@/models/gateway-provisioning-restore.model', () => {
  const restoreModelMocks = {
    findById: jest.fn(),
    findActiveByGateway: jest.fn(),
    findByGatewayId: jest.fn(),
    createIfNoActive: jest.fn(),
    updateStatus: jest.fn(),
    updateProgress: jest.fn(),
    updateChunksTotal: jest.fn(),
    findActiveByFacility: jest.fn(),
    findAllActive: jest.fn(),
    atomicCancel: jest.fn(),
    atomicFailIfActive: jest.fn(),
  };
  return {
    GatewayProvisioningRestoreModel: jest.fn().mockImplementation(() => restoreModelMocks),
    GatewayProvisioningRestoreEventModel: jest.fn().mockImplementation(() => ({
      append: jest.fn().mockResolvedValue(undefined),
      findByRestoreId: jest.fn().mockResolvedValue([]),
    })),
    __restoreModelMocks: restoreModelMocks,
  };
});

jest.mock('@/models/gateway-provisioning-backup.model', () => ({
  GatewayProvisioningBackupModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockResolvedValue({
      id: 'backup-1',
      gateway_id: 'gw-1',
      facility_id: 'fac-1',
      filename: 'mesh.zip',
      size_bytes: 128,
      sha256_hash: '7eb24a18990ee4c958c89773da6cc9fbc5c278357762d02ec6ab947eb28726ff',
      storage_path: 'provisioning/gw-1/backup-1/mesh.zip',
    }),
  })),
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' }),
  })),
}));

jest.mock('@/services/provisioning/provisioning-storage.factory', () => ({
  getProvisioningStorageProvider: jest.fn().mockResolvedValue({
    initialize: jest.fn(),
    download: jest.fn().mockResolvedValue(Buffer.alloc(128, 1)),
  }),
}));

jest.mock('@/services/provisioning/gateway-chunk-push.engine', () => ({
  GatewayChunkPushEngine: {
    executePush: jest.fn().mockResolvedValue({ status: 'complete' }),
    handleChunkAck: jest.fn(),
    cancelPush: jest.fn(),
    pausePushOnDisconnect: jest.fn(),
  },
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: true }),
      unicastToFacility: jest.fn(),
    }),
  },
}));

describe('ProvisioningRestoreService', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __restoreModelMocks: restoreModelMocks } = require('@/models/gateway-provisioning-restore.model');

  const mockRestore = {
    id: 'restore-1',
    backup_id: 'backup-1',
    gateway_id: 'gw-1',
    facility_id: 'fac-1',
    status: 'pending',
    chunks_total: null,
    chunks_sent: 0,
    nonce: 'nonce-1',
    error_message: null,
    initiated_by: 'admin-1',
    started_at: new Date(),
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    restoreModelMocks.findById.mockResolvedValue(mockRestore);
    restoreModelMocks.createIfNoActive.mockResolvedValue({ restore: mockRestore, existingRestore: null });
    restoreModelMocks.findActiveByGateway.mockResolvedValue(null);
    restoreModelMocks.findByGatewayId.mockResolvedValue([]);
    restoreModelMocks.atomicCancel.mockResolvedValue(true);
    restoreModelMocks.atomicFailIfActive.mockResolvedValue(true);
    restoreModelMocks.findAllActive.mockResolvedValue([]);
    restoreModelMocks.findActiveByFacility.mockResolvedValue([]);
  });

  it('initiateRestore creates restore and starts chunk push', async () => {
    const restore = await ProvisioningRestoreService.initiateRestore('backup-1', 'gw-1', 'fac-1', 'admin-1');
    expect(restore.id).toBe('restore-1');
    await new Promise((r) => setTimeout(r, 10));
    expect(GatewayChunkPushEngine.executePush).toHaveBeenCalled();
  });

  it('executeRestore does not fail when chunk push pauses on disconnect', async () => {
    (GatewayChunkPushEngine.executePush as jest.Mock).mockResolvedValueOnce({ status: 'disconnect' });
    await ProvisioningRestoreService.executeRestore('restore-1');
    expect(restoreModelMocks.updateStatus).not.toHaveBeenCalledWith('restore-1', 'failed', expect.any(String));
  });

  it('handleRestoreStatus completes on success', async () => {
    const result = await ProvisioningRestoreService.handleRestoreStatus('fac-1', {
      restore_id: 'restore-1',
      status: 'success',
    });
    expect(result.accepted).toBe(true);
    expect(result.restore_status).toBe('complete');
    expect(restoreModelMocks.updateStatus).toHaveBeenCalledWith('restore-1', 'complete');
  });

  it('handleRestoreStatus fails on gateway error status', async () => {
    const result = await ProvisioningRestoreService.handleRestoreStatus('fac-1', {
      restore_id: 'restore-1',
      status: 'failed',
      error: 'bad zip',
    });
    expect(result.accepted).toBe(true);
    expect(result.restore_status).toBe('failed');
  });

  it('cancelRestore uses atomicCancel', async () => {
    await ProvisioningRestoreService.cancelRestore('restore-1');
    expect(GatewayChunkPushEngine.cancelPush).toHaveBeenCalledWith('restore-1');
    expect(restoreModelMocks.atomicCancel).toHaveBeenCalledWith('restore-1');
    expect(restoreModelMocks.updateStatus).not.toHaveBeenCalledWith('restore-1', 'cancelled');
  });

  it('recoverInFlightStateOnStartup fails stale transferring restores', async () => {
    const staleUpdatedAt = new Date(Date.now() - 10 * 60 * 1000);
    restoreModelMocks.findAllActive.mockResolvedValueOnce([{
      ...mockRestore,
      status: 'transferring',
      updated_at: staleUpdatedAt,
    }]);

    await ProvisioningRestoreService.recoverInFlightStateOnStartup();

    expect(restoreModelMocks.atomicFailIfActive).toHaveBeenCalledWith(
      'restore-1',
      expect.stringContaining('did not reconnect'),
    );
  });

  it('handleFacilityDisconnect schedules grace for transferring restores', async () => {
    restoreModelMocks.findActiveByFacility.mockResolvedValueOnce([{
      ...mockRestore,
      status: 'transferring',
    }]);

    await ProvisioningRestoreService.handleFacilityDisconnect('fac-1');
    expect(GatewayChunkPushEngine.pausePushOnDisconnect).toHaveBeenCalledWith('fac-1');
  });

  it('getRestoreStatus returns null active when no active restore', async () => {
    restoreModelMocks.findActiveByGateway.mockResolvedValueOnce(null);
    restoreModelMocks.findByGatewayId.mockResolvedValueOnce([]);
    const status = await ProvisioningRestoreService.getRestoreStatus('gw-1');
    expect(status.active).toBeNull();
    expect(status.history).toEqual([]);
  });

  it('getRestoreById delegates to model', async () => {
    const row = await ProvisioningRestoreService.getRestoreById('restore-1');
    expect(row?.id).toBe('restore-1');
  });

  it('resumePendingForFacility executes pending restore', async () => {
    restoreModelMocks.findActiveByFacility.mockResolvedValueOnce([{
      ...mockRestore,
      status: 'pending',
    }]);

    await ProvisioningRestoreService.resumePendingForFacility('fac-1');
    await new Promise((r) => setTimeout(r, 10));
    expect(GatewayChunkPushEngine.executePush).toHaveBeenCalled();
  });
});

