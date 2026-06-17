const mockEnqueue = jest.fn();
const mockFindNextDeliverableForFacility = jest.fn();
const mockFindById = jest.fn();
const mockFindByNonce = jest.fn();
const mockMarkInProgress = jest.fn();
const mockMarkDelivered = jest.fn();
const mockScheduleRetry = jest.fn();
const mockCancelActiveForBlulok = jest.fn();
const mockCancelActiveForAccessControl = jest.fn();
const mockRecoverStaleInProgress = jest.fn();
const mockFindDue = jest.fn();

jest.mock('@/models/device-deletion-outbox.model', () => ({
  DeviceDeletionOutboxModel: jest.fn().mockImplementation(() => ({
    enqueue: mockEnqueue,
    findNextDeliverableForFacility: mockFindNextDeliverableForFacility,
    findById: mockFindById,
    findByNonce: mockFindByNonce,
    markInProgress: mockMarkInProgress,
    markDelivered: mockMarkDelivered,
    scheduleRetry: mockScheduleRetry,
    cancelActiveForBlulok: mockCancelActiveForBlulok,
    cancelActiveForAccessControl: mockCancelActiveForAccessControl,
    recoverStaleInProgress: mockRecoverStaleInProgress,
    findDue: mockFindDue,
  })),
}));

jest.mock('@/services/crypto/ed25519.service', () => ({
  Ed25519Service: {
    signCommandJwt: jest.fn().mockResolvedValue('signed-device-deleted-jwt'),
  },
}));

const mockUnicast = jest.fn();
const mockGatewayConnectionStatus = jest.fn(() => ({ connected: true }));
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      unicastToFacility: mockUnicast,
      getFacilityConnectionStatus: mockGatewayConnectionStatus,
    })),
  },
}));

const mockIsBlockingActiveForFacilitySync = jest.fn().mockReturnValue(false);
jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    isBlockingActiveForFacilitySync: (...args: unknown[]) =>
      mockIsBlockingActiveForFacilitySync(...args),
  },
}));

import { DeviceDeletionOutboxService } from '@/services/device-deletion-outbox.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

describe('DeviceDeletionOutboxService', () => {
  let service: DeviceDeletionOutboxService;

  const blulokRow = {
    id: 'outbox-1',
    facility_id: 'fac-1',
    gateway_id: 'gw-1',
    device_kind: 'blulok' as const,
    lock_id: 'LOCK-123',
    access_id: null,
    relay_channel: null,
    status: 'pending' as const,
    attempt_count: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceDeletionOutboxService as unknown as { instance?: DeviceDeletionOutboxService }).instance = undefined;
    mockIsBlockingActiveForFacilitySync.mockReturnValue(false);
    mockGatewayConnectionStatus.mockReturnValue({ connected: true });
    mockEnqueue.mockResolvedValue(blulokRow);
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(blulokRow)
      .mockResolvedValue(null);
    mockMarkInProgress.mockResolvedValue(undefined);
    mockMarkDelivered.mockImplementation(async () => {
      mockFindNextDeliverableForFacility.mockResolvedValue(null);
    });
    mockScheduleRetry.mockResolvedValue('failed');
    mockFindById.mockResolvedValue({ ...blulokRow, attempt_count: 1 });
    mockFindByNonce.mockResolvedValue({ ...blulokRow, status: 'in_progress' });
    mockRecoverStaleInProgress.mockResolvedValue(0);
    mockFindDue.mockResolvedValue([]);
    mockCancelActiveForBlulok.mockResolvedValue(1);
    mockCancelActiveForAccessControl.mockResolvedValue(1);
    service = DeviceDeletionOutboxService.getInstance();
  });

  afterEach(() => {
    const pendingByNonce = (service as unknown as { pendingAcksByNonce?: Map<string, { timer: NodeJS.Timeout }> })
      .pendingAcksByNonce;
    if (pendingByNonce) {
      for (const pending of pendingByNonce.values()) {
        clearTimeout(pending.timer);
      }
      pendingByNonce.clear();
    }
  });

  it('enqueueDeletion enqueues and flushes when gateway is online', async () => {
    const flushSpy = jest.spyOn(service, 'flushPendingForFacility').mockResolvedValue(undefined);

    await service.enqueueDeletion({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKind: 'blulok',
      lockId: 'LOCK-123',
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKind: 'blulok',
      lockId: 'LOCK-123',
    });
    expect(flushSpy).toHaveBeenCalledWith('fac-1');
  });

  it('flushPendingForFacility delivers DEVICE_DELETED and marks delivered on ACK', async () => {
    mockFindNextDeliverableForFacility.mockReset();
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(blulokRow)
      .mockResolvedValue(null);

    const flushPromise = service.flushPendingForFacility('fac-1');

    await new Promise((resolve) => setImmediate(resolve));
    expect(mockMarkInProgress).toHaveBeenCalled();
    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd_type: 'DEVICE_DELETED',
        facility_id: 'fac-1',
        gateway_id: 'gw-1',
        device_kind: 'lock',
        lock_id: 'LOCK-123',
        nonce: expect.any(String),
      }),
    );
    expect(mockUnicast).toHaveBeenCalledWith('fac-1', 'signed-device-deleted-jwt');

    const nonce = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[0][0].nonce as string;
    service.handleDeviceDeletedAck('fac-1', { nonce, success: true });

    await flushPromise;
    expect(mockMarkDelivered).toHaveBeenCalledWith('outbox-1');
  });

  it('flushPendingForFacility signs access_control payload with access_id and relay_channel', async () => {
    const acRow = {
      ...blulokRow,
      device_kind: 'access_control' as const,
      lock_id: null,
      access_id: 'KP-001',
      relay_channel: 2,
    };
    mockFindNextDeliverableForFacility.mockReset();
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(acRow)
      .mockResolvedValue(null);

    const flushPromise = service.flushPendingForFacility('fac-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd_type: 'DEVICE_DELETED',
        device_kind: 'access_control',
        access_id: 'KP-001',
        relay_channel: 2,
      }),
    );

    const nonce = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[0][0].nonce as string;
    service.handleDeviceDeletedAck('fac-1', { nonce, accepted: true });
    await flushPromise;
  });

  it('skips flush when gateway is offline', async () => {
    mockGatewayConnectionStatus.mockReturnValue({ connected: false });

    await service.flushPendingForFacility('fac-1');

    expect(mockFindNextDeliverableForFacility).not.toHaveBeenCalled();
    expect(mockUnicast).not.toHaveBeenCalled();
  });

  it('handleDeviceDeletedAck schedules retry when gateway rejects', async () => {
    mockFindNextDeliverableForFacility.mockReset();
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(blulokRow)
      .mockResolvedValue(null);

    const flushPromise = service.flushPendingForFacility('fac-1');
    await new Promise((resolve) => setImmediate(resolve));

    const nonce = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[0][0].nonce as string;
    service.handleDeviceDeletedAck('fac-1', { nonce, success: false, error: 'rejected' });

    await flushPromise;
    expect(mockScheduleRetry).toHaveBeenCalledWith('outbox-1', 'rejected', expect.any(Number));
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it('handleDeviceDeletedAck resolves late ACK for in_progress row', async () => {
    service.handleDeviceDeletedAck('fac-1', { nonce: 'late-nonce', success: true });

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockFindByNonce).toHaveBeenCalledWith('fac-1', 'late-nonce');
    expect(mockMarkDelivered).toHaveBeenCalledWith('outbox-1');
  });

  it('cancelForBlulok delegates to model', async () => {
    await service.cancelForBlulok('fac-1', 'LOCK-123', 're-added');
    expect(mockCancelActiveForBlulok).toHaveBeenCalledWith('fac-1', 'LOCK-123', 're-added');
  });

  it('cancelForAccessControl delegates to model', async () => {
    await service.cancelForAccessControl('fac-1', 'KP-001', 2);
    expect(mockCancelActiveForAccessControl).toHaveBeenCalledWith(
      'fac-1',
      'KP-001',
      2,
      'Device re-added to cloud inventory',
    );
  });

  it('processDueOutboxPushes flushes facilities with due rows when online', async () => {
    mockFindDue.mockResolvedValue([{ facility_id: 'fac-1' }]);
    const flushSpy = jest.spyOn(service, 'flushPendingForFacility').mockResolvedValue(undefined);

    await service.processDueOutboxPushes();

    expect(mockRecoverStaleInProgress).toHaveBeenCalled();
    expect(flushSpy).toHaveBeenCalledWith('fac-1');
  });

  it('defers delivery without markInProgress when recovery blocks operational outbound', async () => {
    mockIsBlockingActiveForFacilitySync.mockReturnValue(true);
    const payload = Buffer.from(JSON.stringify({ cmd_type: 'DEVICE_DELETED' })).toString('base64url');
    (Ed25519Service.signCommandJwt as jest.Mock).mockResolvedValue(`hdr.${payload}.sig`);

    mockFindNextDeliverableForFacility.mockReset();
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(blulokRow)
      .mockResolvedValue(null);

    await service.flushPendingForFacility('fac-1');

    expect(mockMarkInProgress).not.toHaveBeenCalled();
    expect(mockUnicast).not.toHaveBeenCalled();
    expect(mockScheduleRetry).not.toHaveBeenCalled();
  });

  it('handleDeviceDeletedAck ignores ACK when facilityId does not match pending delivery', async () => {
    mockFindNextDeliverableForFacility.mockReset();
    mockFindNextDeliverableForFacility
      .mockResolvedValueOnce(blulokRow)
      .mockResolvedValue(null);

    const flushPromise = service.flushPendingForFacility('fac-1');
    await new Promise((resolve) => setImmediate(resolve));

    const nonce = (Ed25519Service.signCommandJwt as jest.Mock).mock.calls[0][0].nonce as string;
    service.handleDeviceDeletedAck('fac-other', { nonce, success: true });

    service.handleDeviceDeletedAck('fac-1', { nonce, success: true });
    await flushPromise;

    expect(mockMarkDelivered).toHaveBeenCalledWith('outbox-1');
  });
});
