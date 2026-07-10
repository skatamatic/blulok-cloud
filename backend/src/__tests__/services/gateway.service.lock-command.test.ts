/**
 * GatewayService.sendLockCommand — includes expires_at on LOCK/UNLOCK JWT payloads.
 */
import { GatewayService } from '@/services/gateway/gateway.service';

const mockUnicast = jest.fn();
const mockGetFacilityConnectionStatus = jest.fn();
const mockSignCommandJwt = jest.fn();

const mockDb = jest.fn();

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: mockDb,
    })),
  },
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getFacilityConnectionStatus: mockGetFacilityConnectionStatus,
      unicastToFacility: mockUnicast,
    })),
  },
}));

jest.mock('@/services/crypto/ed25519.service', () => ({
  Ed25519Service: {
    signCommandJwt: (...args: unknown[]) => mockSignCommandJwt(...args),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/services/gateway/gateways/gateway-factory', () => ({
  GatewayFactory: {
    createGateway: jest.fn(),
  },
}));

function resetGatewaySingleton() {
  (GatewayService as unknown as { instance?: GatewayService }).instance = undefined;
}

describe('GatewayService.sendLockCommand', () => {
  beforeEach(() => {
    resetGatewaySingleton();
    jest.clearAllMocks();
    mockGetFacilityConnectionStatus.mockReturnValue({ connected: true });
    mockSignCommandJwt.mockResolvedValue('signed-jwt');

    mockDb.mockImplementation((table: string) => {
      if (table === 'gateways') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
        };
      }
      if (table === 'facilities') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 120 }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
    });
  });

  it('includes expires_at on UNLOCK JWT from facility lock_command_timeout_sec', async () => {
    const svc = GatewayService.getInstance();
    const now = 1_700_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now * 1000);

    jest
      .spyOn(
        svc as unknown as { resolveDeviceIdForLockCommandJwt: (id: string) => Promise<string> },
        'resolveDeviceIdForLockCommandJwt',
      )
      .mockResolvedValue('HW-SERIAL-1');

    const result = await svc.sendLockCommand('gw-1', 'dev-1', 'OPEN');

    expect(result.success).toBe(true);
    expect(mockSignCommandJwt).toHaveBeenCalledWith({
      cmd_type: 'UNLOCK',
      device_id: 'HW-SERIAL-1',
      expires_at: now + 120,
    });
    expect(mockUnicast).toHaveBeenCalledWith('fac-1', 'signed-jwt');

    jest.restoreAllMocks();
  });

  it('includes open_until on UNLOCK JWT when timed open is requested', async () => {
    const svc = GatewayService.getInstance();
    const now = 1_700_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const openUntil = now + 300;

    jest
      .spyOn(
        svc as unknown as { resolveDeviceIdForLockCommandJwt: (id: string) => Promise<string> },
        'resolveDeviceIdForLockCommandJwt',
      )
      .mockResolvedValue('HW-SERIAL-1');

    const result = await svc.sendLockCommand('gw-1', 'dev-1', 'OPEN', { open_until: openUntil });

    expect(result.success).toBe(true);
    expect(mockSignCommandJwt).toHaveBeenCalledWith({
      cmd_type: 'UNLOCK',
      device_id: 'HW-SERIAL-1',
      expires_at: now + 120,
      open_until: openUntil,
    });

    jest.restoreAllMocks();
  });

  it('sends expires_at=0 when facility timeout is 0', async () => {
    mockDb.mockImplementation((table: string) => {
      if (table === 'gateways') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
        };
      }
      if (table === 'facilities') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 0 }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
    });

    const svc = GatewayService.getInstance();
    jest
      .spyOn(
        svc as unknown as { resolveDeviceIdForLockCommandJwt: (id: string) => Promise<string> },
        'resolveDeviceIdForLockCommandJwt',
      )
      .mockResolvedValue('HW-SERIAL-1');

    await svc.sendLockCommand('gw-1', 'dev-1', 'CLOSE');

    expect(mockSignCommandJwt).toHaveBeenCalledWith({
      cmd_type: 'LOCK',
      device_id: 'HW-SERIAL-1',
      expires_at: 0,
    });
  });
});
