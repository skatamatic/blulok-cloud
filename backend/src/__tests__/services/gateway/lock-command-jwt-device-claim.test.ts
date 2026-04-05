import { GatewayService } from '@/services/gateway/gateway.service';

function makeQueryBuilder(row: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row),
  };
}

describe('GatewayService.resolveDeviceIdForLockCommandJwt', () => {
  beforeEach(() => {
    (GatewayService as unknown as { instance?: GatewayService }).instance = undefined;
  });

  it('returns BluLok device_serial for command JWT device_id claim', async () => {
    const svc = GatewayService.getInstance();
    (svc as unknown as { db: jest.Mock }).db = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return makeQueryBuilder({ device_serial: 'BL-LOCK-1001', serial: null });
      }
      return makeQueryBuilder(undefined);
    });

    await expect(svc.resolveDeviceIdForLockCommandJwt('550e8400-e29b-41d4-a716-446655440099')).resolves.toBe(
      'BL-LOCK-1001',
    );
  });

  it('uses gateway serial column when device_serial is empty', async () => {
    const svc = GatewayService.getInstance();
    (svc as unknown as { db: jest.Mock }).db = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return makeQueryBuilder({ device_serial: '  ', serial: 'FALLBACK-SN' });
      }
      return makeQueryBuilder(undefined);
    });

    await expect(svc.resolveDeviceIdForLockCommandJwt('lock-internal-id')).resolves.toBe('FALLBACK-SN');
  });

  it('returns internal id when BluLok has no serial (fallback)', async () => {
    const svc = GatewayService.getInstance();
    (svc as unknown as { db: jest.Mock }).db = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return makeQueryBuilder({ device_serial: '', serial: null });
      }
      return makeQueryBuilder(undefined);
    });

    await expect(svc.resolveDeviceIdForLockCommandJwt('only-uuid')).resolves.toBe('only-uuid');
  });

  it('reads access control serial from metadata or device_settings', async () => {
    const svc = GatewayService.getInstance();
    (svc as unknown as { db: jest.Mock }).db = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return makeQueryBuilder(undefined);
      }
      if (table === 'access_control_devices') {
        return makeQueryBuilder({
          metadata: JSON.stringify({ device_serial: 'GATE-R1' }),
          device_settings: null,
        });
      }
      return makeQueryBuilder(undefined);
    });

    await expect(svc.resolveDeviceIdForLockCommandJwt('ac-device-uuid')).resolves.toBe('GATE-R1');
  });
});
