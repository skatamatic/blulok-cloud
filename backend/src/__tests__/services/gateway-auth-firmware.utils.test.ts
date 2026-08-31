import {
  AUTH_FIRMWARE_VERSION_MAX_LEN,
  parseAuthFirmwareVersion,
  persistAuthFirmwareSeed,
} from '@/utils/gateway-auth-firmware.utils';

const mockUpdate = jest.fn().mockResolvedValue({});
const mockFindByFacilityId = jest.fn();

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  })),
}));

describe('gateway-auth-firmware.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseAuthFirmwareVersion', () => {
    it('returns trimmed version for non-empty strings', () => {
      expect(parseAuthFirmwareVersion('  2.4.1  ')).toBe('2.4.1');
    });

    it('returns null for missing or blank values', () => {
      expect(parseAuthFirmwareVersion(undefined)).toBeNull();
      expect(parseAuthFirmwareVersion(null)).toBeNull();
      expect(parseAuthFirmwareVersion('')).toBeNull();
      expect(parseAuthFirmwareVersion('   ')).toBeNull();
      expect(parseAuthFirmwareVersion(42)).toBeNull();
    });

    it('truncates overlong strings', () => {
      const long = 'v'.repeat(AUTH_FIRMWARE_VERSION_MAX_LEN + 10);
      expect(parseAuthFirmwareVersion(long)).toHaveLength(AUTH_FIRMWARE_VERSION_MAX_LEN);
    });
  });

  describe('persistAuthFirmwareSeed', () => {
    it('no-ops when firmwareVersion is null', async () => {
      await expect(
        persistAuthFirmwareSeed({ facilityId: 'fac-1', gatewayId: 'gw-1', firmwareVersion: null }),
      ).resolves.toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('updates by explicit gatewayId', async () => {
      const result = await persistAuthFirmwareSeed({
        facilityId: 'fac-1',
        gatewayId: 'gw-1',
        firmwareVersion: '3.0.0',
      });
      expect(result).toEqual({ gatewayId: 'gw-1' });
      expect(mockUpdate).toHaveBeenCalledWith('gw-1', { firmware_version: '3.0.0' });
      expect(mockFindByFacilityId).not.toHaveBeenCalled();
    });

    it('returns null when gatewayId is blank', async () => {
      await expect(
        persistAuthFirmwareSeed({ facilityId: 'fac-1', gatewayId: '  ', firmwareVersion: '1.0.0' }),
      ).resolves.toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
