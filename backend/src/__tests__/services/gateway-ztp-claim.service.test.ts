const mockGet = jest.fn();
const mockRemove = jest.fn();
const mockClaimViaZtp = jest.fn();

jest.mock('@/services/gateway/ztp/ztp-pending.store', () => ({
  ZtpPendingStore: {
    getInstance: () => ({
      get: (...args: unknown[]) => mockGet(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
    }),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    claimViaZtp: (...args: unknown[]) => mockClaimViaZtp(...args),
  })),
}));

import { GatewayZtpClaimService } from '@/services/gateway/ztp/gateway-ztp-claim.service';

describe('GatewayZtpClaimService', () => {
  const deviceId = '11111111-1111-4111-8111-111111111111';
  const facilityId = 'fac-1';
  const publicKey = 'pk-abc';
  let send: jest.Mock;
  let ws: { readyState: number; OPEN: number; send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    send = jest.fn();
    ws = { readyState: 1, OPEN: 1, send };
    mockGet.mockReturnValue({ publicKey, ws });
  });

  it('returns bound true / active for greenfield claim', async () => {
    mockClaimViaZtp.mockResolvedValue({
      gateway: { id: deviceId },
      created: true,
      bound: true,
    });

    const result = await GatewayZtpClaimService.getInstance().claim({
      facilityId,
      deviceId,
      publicKey,
      userId: 'user-1',
    });

    expect(result).toEqual({
      ok: true,
      gatewayId: deviceId,
      facilityId,
      created: true,
      bound: true,
      sessionRole: 'active',
    });
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('"sessionRole":"active"'),
    );
    expect(mockRemove).toHaveBeenCalledWith(deviceId);
  });

  it('returns bound false / swap_candidate when facility already has a gateway', async () => {
    mockClaimViaZtp.mockResolvedValue({
      gateway: { id: deviceId, facility_id: null },
      created: true,
      bound: false,
    });

    const result = await GatewayZtpClaimService.getInstance().claim({
      facilityId,
      deviceId,
      publicKey,
      userId: 'user-1',
    });

    expect(result).toMatchObject({
      ok: true,
      bound: false,
      sessionRole: 'swap_candidate',
    });
    const payload = JSON.parse(String(send.mock.calls[0][0]));
    expect(payload).toMatchObject({
      type: 'PROVISION_ASSIGNED',
      gatewayId: deviceId,
      facilityId,
      sessionRole: 'swap_candidate',
    });
  });

  it('returns 425 when device is not in the waiting room', async () => {
    mockGet.mockReturnValue(null);
    const result = await GatewayZtpClaimService.getInstance().claim({
      facilityId,
      deviceId,
      publicKey,
      userId: 'user-1',
    });
    expect(result).toMatchObject({ ok: false, status: 425, code: 'DEVICE_NOT_ONLINE' });
    expect(mockClaimViaZtp).not.toHaveBeenCalled();
  });
});
