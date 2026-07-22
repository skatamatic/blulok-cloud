import {
  buildGatewaySyncProvisionMetadata,
  buildManualProvisionMetadata,
  mapDeviceProvisionDatabaseError,
} from '@/utils/device-provision.utils';
import { ConflictError } from '@/middleware/error.middleware';

describe('device-provision.utils', () => {
  describe('buildManualProvisionMetadata', () => {
    it('sets dual provenance flags and keeps client custom fields', () => {
      const result = buildManualProvisionMetadata({
        createdFromGatewaySync: true,
        custom: 'keep',
      });

      expect(result).toEqual({
        custom: 'keep',
        manuallyAdded: true,
        createdFromGatewaySync: false,
      });
    });
  });

  describe('buildGatewaySyncProvisionMetadata', () => {
    it('sets dual provenance flags for inventory-provisioned devices', () => {
      expect(buildGatewaySyncProvisionMetadata({ note: 'x' })).toEqual({
        note: 'x',
        createdFromGatewaySync: true,
        manuallyAdded: false,
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
