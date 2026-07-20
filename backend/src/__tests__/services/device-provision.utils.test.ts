import {
  buildGatewayProvisionMetadata,
  buildManualProvisionMetadata,
  mapDeviceProvisionDatabaseError,
  markGatewayInventorySeenMetadata,
} from '@/utils/device-provision.utils';
import { ConflictError } from '@/middleware/error.middleware';

describe('device-provision.utils', () => {
  describe('buildManualProvisionMetadata', () => {
    it('strips client sync flags and sets both manuallyAdded and createdFromGatewaySync', () => {
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

  describe('buildGatewayProvisionMetadata', () => {
    it('sets both flags for sync-managed auto-provision', () => {
      expect(buildGatewayProvisionMetadata()).toEqual({
        createdFromGatewaySync: true,
        manuallyAdded: false,
      });
    });
  });

  describe('markGatewayInventorySeenMetadata', () => {
    it('marks a manually added device as seen by gateway without clearing manuallyAdded', () => {
      expect(
        markGatewayInventorySeenMetadata({
          manuallyAdded: true,
          createdFromGatewaySync: false,
          custom: 'keep',
        }),
      ).toEqual({
        manuallyAdded: true,
        createdFromGatewaySync: true,
        custom: 'keep',
      });
    });

    it('returns null when createdFromGatewaySync is already true', () => {
      expect(
        markGatewayInventorySeenMetadata({
          manuallyAdded: true,
          createdFromGatewaySync: true,
        }),
      ).toBeNull();
    });

    it('returns null for non-manual rows', () => {
      expect(markGatewayInventorySeenMetadata({})).toBeNull();
      expect(
        markGatewayInventorySeenMetadata({ createdFromGatewaySync: true, manuallyAdded: false }),
      ).toBeNull();
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
