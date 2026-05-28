import {
  buildManualProvisionMetadata,
  mapDeviceProvisionDatabaseError,
} from '@/utils/device-provision.utils';
import { ConflictError } from '@/middleware/error.middleware';

describe('device-provision.utils', () => {
  describe('buildManualProvisionMetadata', () => {
    it('strips sync-managed flags and sets manuallyAdded', () => {
      const result = buildManualProvisionMetadata({
        createdFromGatewaySync: true,
        createdFromInventorySync: true,
        autoCreated: true,
        custom: 'keep',
      });

      expect(result).toEqual({
        custom: 'keep',
        manuallyAdded: true,
      });
    });
  });

  describe('mapDeviceProvisionDatabaseError', () => {
    it('maps duplicate device_serial to conflict', () => {
      const err = mapDeviceProvisionDatabaseError({
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        message: "Duplicate entry 'X' for key 'blulok_devices.device_serial'",
      });
      expect(err).toBeInstanceOf(ConflictError);
      expect(err?.message).toMatch(/serial/i);
    });
  });
});
